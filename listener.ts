// listener.ts
import {
    LIQUIDITY_STATE_LAYOUT_V4,
    Liquidity,
    LiquidityStateV4,
} from '@raydium-io/raydium-sdk';
import { PublicKey, Connection, KeyedAccountInfo } from '@solana/web3.js';
import { retrieveEnvVariable } from './utils';
import pino from 'pino';
import { MintLayout } from './types';
import moment from 'moment';
import { buy, sell } from './buy';

const transport = pino.transport({
    targets: [
        {
            level: 'trace',
            target: 'pino-pretty',
            options: {},
        },
    ],
});

export const logger = pino(
    {
        redact: ['poolKeys'],
        serializers: {
            error: pino.stdSerializers.err,
        },
        base: undefined,
    },
    transport,
);

const network = 'mainnet-beta';
const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger);
const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT', logger);
const CHECK_IF_MINT_IS_RENOUNCED = retrieveEnvVariable('CHECK_IF_MINT_IS_RENOUNCED', logger) === 'true';
const solanaConnection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

// const USE_SNIPE_LIST = retrieveEnvVariable('USE_SNIPE_LIST', logger) === 'true';
// const SNIPE_LIST_REFRESH_INTERVAL = Number(retrieveEnvVariable('SNIPE_LIST_REFRESH_INTERVAL', logger));
const SELL_DELAY = Number(retrieveEnvVariable('SELL_DELAY', logger));
const MAX_TOKENS_TO_BUY = Number(retrieveEnvVariable('MAX_TOKENS_TO_BUY', logger));

let tokensBoughtCount = 0;
let startNewCycle = true;
let basePoolBalanceWhenBought: number = 0;

export async function processRaydiumPool(updatedAccountInfo: KeyedAccountInfo) {
    let accountData: LiquidityStateV4 | undefined;
    try {
        if (updatedAccountInfo.accountInfo.data === undefined) {
            console.error('Account data is undefined');
            return;
        }

        const decodedData = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
        accountData = decodedData as LiquidityStateV4;

        if (CHECK_IF_MINT_IS_RENOUNCED) {
            const mintOption = await checkMintable(accountData.baseMint);
      
            if (mintOption !== true) {
              logger.warn({ "mint": accountData.baseMint.toString() }, 'Skipping, owner can mint tokens!');
              return;
            }
          }

        const startTime = moment.utc(accountData.poolOpenTime.toNumber() * 1000).utcOffset('+0100');
        const elapsedTime = startTime.fromNow();

        console.log('Trading Starts:', elapsedTime);
        const lpMintAddress = updatedAccountInfo.accountId;

        console.log('Liquidity Pool Pair:', lpMintAddress.toString());

        if (startNewCycle) {
            tokensBoughtCount = 0;
            startNewCycle = false;
            logger.info('New cycle started');
        }

        if (tokensBoughtCount < MAX_TOKENS_TO_BUY) {
            logger.info(`Token Mint Address: ${accountData.baseMint.toString()}`);
            // logger.info(`baseVault Address: ${accountData.baseVault.toString()}`);
            // logger.info(`quoteVault Address: ${accountData.quoteVault.toString()}`);
        
            // const qvault: number = await solanaConnection.getBalance(accountData.quoteVault);
            // const solAmount: number = qvault / Math.pow(10, 9);
            const baseDecimal: number = accountData.baseDecimal.toNumber();
            // logger.info(`Base Decimal: ${baseDecimal}`);
            // logger.info(`Pool Sol Balance: ${solAmount}`);
        
            const tokenBalanceResponse = await solanaConnection.getTokenAccountBalance(accountData.baseVault);
            const baseVaultTokenBalanceString: string = tokenBalanceResponse.value.amount;
            const baseVaultTokenBalance: number = parseFloat(baseVaultTokenBalanceString);
            const formattedBaseVaultTokenBalance = baseVaultTokenBalance / Math.pow(10, baseDecimal);
            // logger.info(`Base Pool Balance: ${formattedBaseVaultTokenBalance.toLocaleString()}`);
        
            //Get the total supply of the token
            const baseMintInfo = await solanaConnection.getTokenSupply(new PublicKey(accountData.baseMint));
            const totalSupply = baseMintInfo?.value.uiAmount;
        
            if (totalSupply !== null && totalSupply !== undefined) {
                logger.info(`Total Supply: ${totalSupply.toLocaleString()}`);
                const basePoolBalancePercentage = (formattedBaseVaultTokenBalance / totalSupply) * 100;
                logger.info(`Base Pool Balance Percentage: ${basePoolBalancePercentage.toFixed(2)}%`);
        
                if (basePoolBalancePercentage >= 40) {
                    await buy(updatedAccountInfo.accountId, accountData);
                    setTimeout(async () => {
                        await sell(updatedAccountInfo.accountId, accountData as LiquidityStateV4, tokensBoughtCount, basePoolBalanceWhenBought);
                    }, SELL_DELAY);
                    tokensBoughtCount++;
                    logger.info(`Bought ${tokensBoughtCount} tokens`);
                } else {
                    logger.info(`Base Pool Balance Percentage (${basePoolBalancePercentage.toFixed(2)}%) is below 40%. Skipping buy transaction.`);
                }
            } else {
                logger.error('Failed to retrieve total supply.');
            }
        }        

        if (tokensBoughtCount >= MAX_TOKENS_TO_BUY) {
            startNewCycle = true;
            logger.info('Previous cycle ended, Starting new cycle');
        }
    } catch (e) {
        console.log(e);
    }
}

// checks if the mint is renounced
export async function checkMintable(vault: PublicKey): Promise<boolean | undefined> {
    try {
      let { data } = (await solanaConnection.getAccountInfo(vault)) || {};
      if (!data) {
        return;
      }
      const deserialize = MintLayout.decode(data), mintAuthorityOption = deserialize.mintAuthorityOption;
      return mintAuthorityOption === 0;
    } catch (e) {
      logger.error({ mint: vault, error: e }, `Failed to check if mint is renounced`);
    }
  }
  