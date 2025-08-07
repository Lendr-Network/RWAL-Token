import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  // CONFIGURATION - Update these addresses for your network
  const PROXY_ADDRESS = process.env.RWAL_TOKEN_BSC;                                 
  
  console.log("Starting RWAL upgrade...");
  console.log("Proxy Address:", PROXY_ADDRESS);

  // Get the new implementation
  const RwalV2 = await ethers.getContractFactory("RWAL");
  
  // Perform the upgrade
  console.log("Upgrading...");
  const upgradedRwal = await upgrades.upgradeProxy(PROXY_ADDRESS, RwalV2);
  
  console.log("Upgrade completed!");
  console.log("Proxy Address:", await upgradedRwal.getAddress());
  
  // Quick verification
  const name = await upgradedRwal.name();
  const symbol = await upgradedRwal.symbol();
  const totalSupply = await upgradedRwal.totalSupply();
  
  console.log("Verification:");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Total Supply:", ethers.formatEther(totalSupply));
  
  console.log("Done!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
