import {
    AbstractTransactPlugin,
    TransactContext,
    TransactHookResponseType,
    TransactHookTypes,
    Transaction,
    Cancelable,
    PromptResponse,
} from '@wharfkit/session'

/** Import JSON localization strings */
import defaultTranslations from './translations.json'

const START_CHECKING_FINALITY_AFTER = 150000 // 2.5 minutes

export class TransactPluginFinalityChecker extends AbstractTransactPlugin {
    /** A unique ID for this plugin */
    id = 'transact-plugin-finality-checker'

    /** Optional - The translation strings to use for the plugin */
    translations = defaultTranslations

    /**
     * Register the hooks required for this plugin to function
     *
     * @param context The TransactContext of the transaction being performed
     */
    register(context: TransactContext): void {
        // Register any desired afterBroadcast hooks
        context.addHook(
            TransactHookTypes.afterBroadcast,
            (request, context): Promise<TransactHookResponseType> => {

                if (!context.ui) {
                    throw new Error('UI not available')
                }

                const expectedFinalityTime = new Date(Date.now() + START_CHECKING_FINALITY_AFTER)

                // Prompt the user with the link to view the transaction
                const prompt: Cancelable<PromptResponse> = context.ui.prompt({
                    title: t('title', {
                        default: 'Transaction Broadcasted',
                    }),
                    body: t('body', {
                        default:
                            'Your transaction has been broadcast to the network, but is not yet irreversable.',
                    }),
                    elements: [
                        {
                            type: 'countdown',
                            data: expectedFinalityTime.toISOString(),
                        },
                        {
                            type: 'close',
                        },
                    ],
                })

                setTimeout(async () => {
                    this.log('Checking transaction finality')
                    waitForFinality(request.getRawTransaction(), context)
                        .then(() => {
                            this.log('Transaction finality reached')

                            prompt.cancel()
                        })
                        .catch((error) => {
                            this.log('Error while checking transaction finality', error)
                        })
                }, START_CHECKING_FINALITY_AFTER)

                return Promise.resolve()
            }
        )
    }

    log(...args: any[]) {
        // eslint-disable-next-line no-console
        console.log('TransactPluginFinalityChecker, LOG:', ...args)
    }
}

let retries = 0

async function waitForFinality(transaction: Transaction, context: TransactContext): Promise<void> {
    return new Promise((resolve, reject) => {
        context.client.v1.chain
            .get_transaction_status(transaction.id)
            .then((response) => {
                if (response.state === 'IRREVERSIBLE') {
                    return resolve()
                }

                setTimeout(() => {
                    waitForFinality(transaction, context).then(resolve).catch(reject)
                }, 5000)
            })
            .catch((error) => {
                if (error.response && error.response.status === 404 && retries < 3) {
                    retries++

                    setTimeout(() => {
                        waitForFinality(transaction, context).then(resolve).catch(reject)
                    }, 5000)
                } else {
                    reject(error)
                }
            })
    })
}
