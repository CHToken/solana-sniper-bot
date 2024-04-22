import {
    MARKET_STATE_LAYOUT_V3,
    MarketStateV3,
    LiquidityPoolKeys,
  } from '@raydium-io/raydium-sdk';
  import { PublicKey, Connection, KeyedAccountInfo } from '@solana/web3.js';
  import { getMinimalMarketV3, MinimalMarketLayoutV3 } from './market';
  import { saveTokenAccount } from './buy';
  import { logger } from './buy';
  
  export type MinimalTokenAccountData = {
    mint: PublicKey;
    address: PublicKey;
    poolKeys?: LiquidityPoolKeys;
    market?: MinimalMarketLayoutV3;
  };

  let existingTokenAccounts: Map<string, MinimalTokenAccountData> = new Map<string, MinimalTokenAccountData>();

  export async function processOpenBookMarket(updatedAccountInfo: KeyedAccountInfo) {
    let accountData: MarketStateV3 | undefined;
    try {
      accountData = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);
  
      // to be competitive, we collect market data before buying the token...
      if (existingTokenAccounts.has(accountData.baseMint.toString())) {
        return;
      }
  
      saveTokenAccount(accountData.baseMint, accountData);
    } catch (e) {
      logger.error({ ...accountData, error: e }, `Failed to process market`);
    }
  }
  