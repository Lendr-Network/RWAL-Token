import { ethers, upgrades, network } from "hardhat";

async function main() {
  // --- Network-specific configuration ---
  // BSC Testnet
  const bscTestnet = {
    rmnProxy: "0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D",
    router: "0xE1053aE1857476f36A3C62580FF9b016E8EE8F6f",
  };
  // Avalanche Fuji
  const fuji = {
    rmnProxy: "0xAc8CFc3762a979628334a0E4C1026244498E821b",
    router: "0xF694E193200268f9a4868e4Aa017A0118C9a8177",
  };

  const sepolia = {
    rmnProxy: "0xba3f6251de62dED61Ff98590cB2fDf6871FbB991",
    router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
  };

  const baseSepolia = {
    rmnProxy: "0x99360767a4705f68CcCb9533195B761648d6d807",
    router: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93",
  };

  // Choose config based on network
  let config;
  if (network.name === "bscTestnet" || network.name === "bsc-testnet") {
    config = bscTestnet;
    console.log("Deploying to BSC Testnet");
  } else if (network.name === "fuji" || network.name === "avalancheFuji" || network.name === "avalanche-fuji") {
    config = fuji;
    console.log("Deploying to Avalanche Fuji");
  } else if (network.name === "sepolia" || network.name === "sepoliaTestnet" || network.name === "sepolia-testnet") {
    config = sepolia;
    console.log("Deploying to sepolia testnet"); 
  } else if (network.name === "baseSepolia" || network.name === "base-sepolia" || network.name === "base") {
    config = baseSepolia;
    console.log("Deploying to base-sepolia testnet"); 
  }else {
    throw new Error(`Unsupported network: ${network.name}`);
  }

  // --- Deploy BurnMintERC20 (Upgradeable) ---
  const Rwal = await ethers.getContractFactory(
    "RWAL"
  );
  const name = "RWAL-lendr.fi";
  const symbol = "RWAL";
  const decimals = 18;
  const preMint =  ethers.parseUnits("100000000", 18);
  // const preMint =  0;
  const defaultAdmin = "0xBE7a1Fba3F1F7e273Ab67208B5E841693631a723"; 

  const erc20 = await upgrades.deployProxy(
    Rwal,
    [name, symbol, defaultAdmin, preMint, decimals],
    { 
            kind: 'uups',
            initializer: 'initialize'
        }
  );
  await erc20.waitForDeployment();
  const erc20Address = await erc20.getAddress();
  console.log("BurnMintERC20 (proxy) deployed to:", erc20Address);

  // --- Deploy BurnMintTokenPool ---
  const BurnMintTokenPool = await ethers.getContractFactory("BurnMintTokenPool");
  const localTokenDecimals = decimals;
  const allowlist: string[] = []; // Add addresses if needed
  const rmnProxy = config.rmnProxy;
  const router = config.router;
  console.log("Deploying BurnMintTokenPool...");
  console.log("rmnProxy:", rmnProxy);
  console.log("router:", router);
  console.log("localTokenDecimals:", localTokenDecimals);
  console.log("allowlist:", allowlist);
  console.log("erc20Address:", erc20Address);
  const tokenPool = await BurnMintTokenPool.deploy(
    erc20Address,
    localTokenDecimals,
    allowlist,
    rmnProxy,
    router
  );
  await tokenPool.waitForDeployment();
  const tokenPoolAddress = await tokenPool.getAddress();
  console.log("BurnMintTokenPool deployed to:", tokenPoolAddress);

  // --- Print implementation address for verification ---
  const implAddress = await upgrades.erc1967.getImplementationAddress(erc20Address);
  console.log("BurnMintERC20 implementation address:", implAddress);

  // --- Print summary for verification script ---
  console.log("\n--- Deployment Summary ---");
  console.log("ERC20 Proxy Address:", erc20Address);
  console.log("ERC20 Implementation Address:", implAddress);
  console.log("BurnMintTokenPool Address:", tokenPoolAddress);
  console.log("\nNext: Copy these addresses into scripts/verify.ts and run the verification script.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 