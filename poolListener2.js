const { Connection, PublicKey } = require("@solana/web3.js");

const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const processedSignatures = new Set(); // Store processed signatures

const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=ed620522-48b4-40ea-b0a2-35fe751c512d");

// Monitor logs
async function main(connection, programAddress) {
    console.log("Monitoring logs for program:", programAddress.toString());
    connection.onLogs(
        programAddress,
        ({ logs, err, signature }) => {
            if (err) return;

            if (logs && logs.some(log => log.includes("initialize2"))) {
                if (!processedSignatures.has(signature)) { // Check if the signature has already been processed
                    console.log("Signature for 'initialize2':", signature);
                    fetchRaydiumAccounts(signature, connection);
                    processedSignatures.add(signature); // Add the signature to the set
                }
            }
        },
        "finalized"
    );
}

// Parse transaction and filter data
async function fetchRaydiumAccounts(txId, connection) {
    const tx = await connection.getParsedTransaction(
        txId,
        {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });
    
    const accounts = tx?.transaction.message.instructions.find(ix => ix.programId.toBase58() === RAYDIUM_PUBLIC_KEY).accounts;

    if (!accounts) {
        console.log("No accounts found in the transaction.");
        return;
    }

    const tokenAIndex = 8;
    const tokenBIndex = 9;

    const tokenAAccount = accounts[tokenAIndex];
    const tokenBAccount = accounts[tokenBIndex];

    const displayData = [
        { "Token": "A", "Account Public Key": tokenAAccount.toBase58() },
        { "Token": "B", "Account Public Key": tokenBAccount.toBase58() }
    ];
    console.log("New LP Found");
    console.log(generateExplorerUrl(txId));
    console.table(displayData);
}

function generateExplorerUrl(txId) {
    return `https://solscan.io/tx/${txId}`;
}

main(connection, new PublicKey(RAYDIUM_PUBLIC_KEY)).catch(console.error);
