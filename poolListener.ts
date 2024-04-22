// poolListener.js
import { Connection, PublicKey } from "@solana/web3.js";
import TelegramBot from 'node-telegram-bot-api';

const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const processedSignatures: Set<string> = new Set();

const connection: Connection = new Connection("https://mainnet.helius-rpc.com/?api-key=ed620522-48b4-40ea-b0a2-35fe751c512d");

const botToken: string = '6857429047:AAHSNRZET94j0JPjns3X_fmbt4TurcmDIII';
const bot = new TelegramBot(botToken, { polling: true });

export async function main(connection: Connection, programAddress: PublicKey) {
    console.log("Monitoring logs for program:", programAddress.toString());
    connection.onLogs(
        programAddress,
        async ({ logs, err, signature }) => {
            if (err) return;

            if (logs && logs.some(log => log.includes("initialize2"))) {
                if (!processedSignatures.has(signature)) {
                    console.log("Signature for 'initialize2':", signature);
                    await fetchRaydiumAccounts(signature, connection);
                    processedSignatures.add(signature);
                }
            }
        },
        "finalized"
    );
}

export async function fetchRaydiumAccounts(txId: string, connection: Connection) {
    const chatId: string = '5844846088';
    const tx = await connection.getParsedTransaction(
        txId,
        {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

    if (!tx) {
        console.log("Transaction not found.");
        return;
    }

    const instruction = tx.transaction.message.instructions.find(ix => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY);

    if (!instruction) {
        console.log("Instruction not found.");
        return;
    }

    if ('accounts' in instruction) {
        const accounts = instruction.accounts;
        console.log("New LP Found");

        const tokenCIndex: number = 10;
        const tokenDIndex: number = 11;
        const tokenCAccount = accounts[tokenCIndex];
        const tokenDAccount = accounts[tokenDIndex];
        // Get the balance of the account associated with tokenDIndex = 11 and tokenCIndex = 10
        const tokenCBalance = await connection.getTokenAccountBalance(tokenCAccount);
        const tokenDBalance = await connection.getTokenAccountBalance(tokenDAccount);

        // Fetch total supply of tokenAAccount
        const tokenAIndex: number = 8;
        const tokenAAccount = accounts[tokenAIndex];
        const tokenASupply = await connection.getTokenSupply(new PublicKey(tokenAAccount.toBase58()));


        // Send mint address only if the signature has not been processed before
        if (!processedSignatures.has(txId)) {
            const message = `
*New LP Found* 🚀
\`Mint Address:\` ${tokenAAccount.toBase58()}
\`Pooled SOL:\` ${tokenDBalance.value.uiAmount}
\`Pooled TOKEN:\` ${tokenCBalance.value.uiAmount}
\`Total Supply:\` ${tokenASupply.value.uiAmount}
[View Transaction](https://solscan.io/tx/${txId})

*Account Details:*
\`\`\`
Token                | Account Public Key
---------------------|--------------------
Pool Token Address   | ${tokenCAccount.toBase58()}
Pool Sol Address     | ${tokenDAccount.toBase58()}
\`\`\`
`;
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            processedSignatures.add(txId);
        }

        // const displayData = [
        //     { "Token": "Mint Address", "Account Public Key": tokenAAccount.toBase58() },
        //     { "Token": "Pool Token Address", "Account Public Key": tokenCAccount.toBase58() },
        //     { "Token": "Pool Sol Address", "Account Public Key": tokenDAccount.toBase58() }
        // ];
        console.log(generateExplorerUrl(txId));
        // console.table(displayData);
    } else {
        console.log("No accounts found in the instruction.");
    }
}

function generateExplorerUrl(txId: string) {
    return `https://solscan.io/tx/${txId}`;
}

main(connection, new PublicKey(RAYDIUM_PUBLIC_KEY)).catch(console.error);
