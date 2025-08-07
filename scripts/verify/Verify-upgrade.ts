// scripts/simple-verify.ts
import { ethers, upgrades } from "hardhat";
import { run } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const PROXY_ADDRESS = process.env.RWAL_TOKEN_BSC;
  
  if (!PROXY_ADDRESS) {
    console.error("RWAL_TOKEN_BSC not set in .env");
    return;
  }
  
  console.log("RWAL Upgrade Verification");
  console.log("Proxy:", PROXY_ADDRESS);
  
  try {
    // Get implementation address
    const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const implBytes = await ethers.provider.getStorage(PROXY_ADDRESS, IMPL_SLOT);
    const implAddress = ethers.getAddress("0x" + implBytes.slice(-40));
    
    console.log("Implementation:", implAddress);
    
    // Test proxy functionality
    const rwal = await ethers.getContractAt("RWAL", PROXY_ADDRESS);
    const name = await rwal.name();
    const symbol = await rwal.symbol();
    const totalSupply = await rwal.totalSupply();
    
    console.log("Name:", name);
    console.log("Symbol:", symbol);
    console.log("Supply:", ethers.formatEther(totalSupply));
    
    // Test interface support (main upgrade fix)
    const ierc20Support = await rwal.supportsInterface("0x36372b07");
    const ierc165Support = await rwal.supportsInterface("0x01ffc9a7");
    
    console.log("IERC20 Support:", ierc20Support);
    console.log("IERC165 Support:", ierc165Support);
    
    // Try to verify on block explorer
    try {
      await run("verify:verify", {
        address: implAddress,
        constructorArguments: [],
      });
      console.log("Block explorer verification successful");
    } catch (error) {
      console.log("Manual verification needed:");
      console.log("Address:", implAddress);
      console.log("URL: https://testnet.bscscan.com/address/" + implAddress);
    }
    
    console.log("\n Verification Complete!");
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().catch(console.error);
