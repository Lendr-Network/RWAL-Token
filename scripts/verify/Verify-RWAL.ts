import { ethers, upgrades, network } from "hardhat";
import { run } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();


// Fill these with your actual deployed addresses from deployment summary:
const ERC20_PROXY_ADDRESS = process.env.RWAL_TOKEN_BSC;      
const BURN_MINT_TOKEN_POOL_ADDRESS = process.env.RWAL_POOL_BSC; 

// Network-specific configuration (matching your deployment script)
const getNetworkConfig = () => {
  if (network.name === "bscTestnet" || network.name === "bsc-testnet") {
    return {
      rmnProxy: "0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D",
      router: "0xE1053aE1857476f36A3C62580FF9b016E8EE8F6f",
    };
  } else if (network.name === "fuji" || network.name === "avalancheFuji" || network.name === "avalanche-fuji") {
    return {
      rmnProxy: "0xAc8CFc3762a979628334a0E4C1026244498E821b",
      router: "0xF694E193200268f9a4868e4Aa017A0118C9a8177",
    };
  } else if (network.name === "sepolia" || network.name === "sepoliaTestnet" || network.name === "sepolia-testnet") {
    return {
      rmnProxy: "0xba3f6251de62dED61Ff98590cB2fDf6871FbB991",
      router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
    };
  } else if (network.name === "baseSepolia" || network.name === "base-sepolia" || network.name === "base") {
    return {
      rmnProxy: "0x99360767a4705f68CcCb9533195B761648d6d807",
      router: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93",
    };
  } else {
    throw new Error(`Unsupported network: ${network.name}`);
  }
};

async function main(): Promise<void> {
  console.log(`\n=== Starting Verification on ${network.name} ===`);
  
  const config = getNetworkConfig();
  
  // RWAL initialization parameters (from your deployment script)
  const rwalInitArgs = [
    "RWAL-lendr.fi",                         // name
    "RWAL",                                  // symbol
    "0xBE7a1Fba3F1F7e273Ab67208B5E841693631a723", // defaultAdmin
    // ethers.parseUnits("100000000", 18),      // preMint\
    0,
    18                                       // decimals
  ];
  
  // BurnMintTokenPool constructor arguments (from your deployment script)
  const tokenPoolConstructorArgs = [
    ERC20_PROXY_ADDRESS,          // token address
    18,                           // localTokenDecimals
    [],                           // allowlist (empty array)
    config.rmnProxy,              // rmnProxy
    config.router,                // router
  ];

  // 1. Get and verify RWAL Implementation
  let implAddress: string;
  try {
    implAddress = await upgrades.erc1967.getImplementationAddress(ERC20_PROXY_ADDRESS);
    console.log("RWAL implementation address:", implAddress);
  } catch (error: any) {
    console.error("Error getting implementation address:", error.message || error);
    return;
  }

  try {
    console.log("\n=== Verifying RWAL Implementation ===");
    await run("verify:verify", {
      address: implAddress,
      constructorArguments: [], // UUPS implementation has empty constructor
      contract: "contracts/RWALToken.sol:RWAL"
    });
    console.log("✅ RWAL implementation verified successfully!");
  } catch (error: any) {
    console.error("❌ RWAL implementation verification failed:", error.message || error);
    
    // Try alternative verification method
    console.log("\n=== Trying alternative verification method for RWAL ===");
    try {
      await run("verify:verify", {
        address: implAddress,
        constructorArguments: [],
      });
      console.log("✅ RWAL implementation verified with alternative method!");
    } catch (error2: any) {
      console.error("❌ Alternative RWAL verification also failed:", error2.message || error2);
    }
  }

  // 2. Verify BurnMintTokenPool
  try {
    console.log("\n=== Verifying BurnMintTokenPool ===");
    await run("verify:verify", {
      address: BURN_MINT_TOKEN_POOL_ADDRESS,
      constructorArguments: tokenPoolConstructorArgs,
      contract: "mock/src/v0.8/ccip/pools/BurnMintTokenPool.sol:BurnMintTokenPool"
    });
    console.log("✅ BurnMintTokenPool verified successfully!");
  } catch (error: any) {
    console.error("❌ BurnMintTokenPool verification failed:", error.message || error);
    
    // Try without explicit contract specification
    console.log("\n=== Trying BurnMintTokenPool verification without contract specification ===");
    try {
      await run("verify:verify", {
        address: BURN_MINT_TOKEN_POOL_ADDRESS,
        constructorArguments: tokenPoolConstructorArgs,
      });
      console.log("✅ BurnMintTokenPool verified with alternative method!");
    } catch (error2: any) {
      console.error("❌ BurnMintTokenPool alternative verification also failed:", error2.message || error2);
    }
  }

  // 3. Optional: Verify the proxy contract itself
  try {
    console.log("\n=== Verifying Proxy Contract (Optional) ===");
    await run("verify:verify", {
      address: ERC20_PROXY_ADDRESS,
      constructorArguments: [implAddress, "0x"], // Standard UUPS proxy constructor args
    });
    console.log("✅ Proxy contract verified successfully!");
  } catch (error: any) {
    console.log("ℹ️  Proxy verification failed (this is often expected):", error.message || error);
  }

  console.log("\n=== Verification Summary ===");
  console.log("Network:", network.name);
  console.log("ERC20 Proxy Address:", ERC20_PROXY_ADDRESS);
  console.log("ERC20 Implementation Address:", implAddress);
  console.log("BurnMintTokenPool Address:", BURN_MINT_TOKEN_POOL_ADDRESS);
  console.log("RMN Proxy:", config.rmnProxy);
  console.log("CCIP Router:", config.router);
  console.log("\n✅ Verification process completed!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
