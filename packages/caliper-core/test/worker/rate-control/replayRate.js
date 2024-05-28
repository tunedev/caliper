/*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

const mockery = require('mockery');
const fs = require('fs');
const { createRateController } = require('../../../lib/worker/rate-control/replayRate');
const TestMessage = require('../../../lib/common/messages/testMessage');
const TransactionStatisticsCollector = require('../../../lib/common/core/transaction-statistics-collector');

const chai = require('chai');
chai.should();
const sinon = require('sinon');
const replaySandbox = sinon.createSandbox();

const pathTemplate = '../tx_records_client<C>_round<R>.txt';

describe('ReplayRate controller', () => {

    before(() => {
        mockery.enable({
            warnOnReplace: false,
            warnOnUnregistered: false,
            useCleanCache: true
        });

        mockery.registerMock('../../common/utils/caliper-utils', {
            sleep: replaySandbox.stub(),
            getLogger: replaySandbox.stub().returns({
                warn: replaySandbox.stub(),
                debug: replaySandbox.stub()
            }),
            resolvePath: replaySandbox.stub().returnsArg(0)
        });
    });

    afterEach(() => {
        replaySandbox.restore();
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    it('should correctly import timings from a text file and apply rate control', async () => {
        const fsReadFileStub = replaySandbox.stub(fs, 'readFileSync');
        replaySandbox.stub(fs, 'existsSync').callsFake(() => true);

        fsReadFileStub.returns('100\n200\n300');

        const msgContent = {
            label: 'test',
            rateControl: {
                type: 'replay-rate',
                opts: {
                    pathTemplate,
                    inputFormat: 'TEXT'
                }
            },
            workload: {
                module: 'module.js'
            },
            testRound: 0,
            txDuration: 250,
            totalWorkers: 2
        };

        const testMessage = new TestMessage('test', [], msgContent);
        const stubStatsCollector = replaySandbox.createStubInstance(TransactionStatisticsCollector);
        stubStatsCollector.getTotalSubmittedTx.returns(1);
        stubStatsCollector.getRoundStartTime.returns(Date.now() - 100);

        const rateController = createRateController(testMessage, stubStatsCollector, 0);
        await rateController.applyRateControl();

        sinon.assert.calledWith(fsReadFileStub, '/home/tunedev/caliper/packages/tx_records_client0_round0.txt', 'utf-8');
        rateController.records.should.deep.equal([100, 200, 300]);
    });

    it('should throw an error if the trace file does not exist', () => {
        replaySandbox.stub(fs, 'existsSync').callsFake(() => false);
        const msgContent = {
            label: 'test',
            rateControl: {
                'type': 'replay-rate',
                'opts': {
                    'pathTemplate': 'path/to/nonexistent_trace.txt',
                    'inputFormat': 'TEXT'
                }
            },
            workload: {
                module: 'module.js'
            },
            testRound: 0,
            txDuration: 250,
            totalWorkers: 2
        };

        const testMessage = new TestMessage('test', [], msgContent);
        const stubStatsCollector = replaySandbox.createStubInstance(TransactionStatisticsCollector);

        (() => {
            createRateController(testMessage, stubStatsCollector, 0);
        }).should.throw(/Trace file does not exist/);
    });

    // Additional tests can be added here
});
