import {TransactContext, SigningRequest, Transaction} from '@wharfkit/session'
import {expect} from 'chai'
import sinon from 'sinon'

import {TransactPluginFinalityChecker} from '$lib'
import { doesNotMatch } from 'assert'

suite('TransactPluginFinalityChecker', () => {
    let context: TransactContext
    let request: SigningRequest
    let finalityChecker: TransactPluginFinalityChecker
    let hooks: Function[] = []
    let promptsCalls = 0
    let clock: sinon.SinonFakeTimers

    function setupVariables() {
        context = {
            ui: {
                prompt: () => {
                    promptsCalls += 1
                },
                getTranslate: () => (key) => key,
            },
            client: {
                v1: {
                    chain: {
                        get_transaction_status: () => Promise.resolve({state: 'IRREVERSIBLE'}),
                    },
                },
            },
            addHook: (_, finalityPluginFn) => {
                hooks.push(finalityPluginFn as Function)
            },
        } as unknown as TransactContext

        request = {
            getRawTransaction: () =>
                ({
                    id: 'transaction_id',
                } as unknown as Transaction),
        } as SigningRequest
        
        finalityChecker = new TransactPluginFinalityChecker()
    }


    function resetVariables() {
        hooks = []
        promptsCalls = 0
    }

    function executeAllHooks() {
        return Promise.all(hooks.map(async (hookFunction) => {
            try {
                await hookFunction(request, context)
            } catch(error) {
                throw error
            }
        }))
    }

    setup(() => {
        setupVariables()

        clock = sinon.useFakeTimers()
    })

    teardown(() => {
        clock.restore()
    })

    test('should register the afterBroadcast hook', () => {
        resetVariables()

        finalityChecker.register(context)

        expect(hooks).to.have.length(1)
    })

    test('should call prompt method twice when the afterBroadcast hook is executed', (done) => {
        resetVariables()

        finalityChecker.register(context)

        executeAllHooks().then(() => {
            expect(promptsCalls).to.equal(2)
            done()
        })

        expect(promptsCalls).to.equal(1)

        // Simulate the passage of time to trigger the setTimeout behavior
        clock.tick(200000)
    })
})
