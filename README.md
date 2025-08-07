RWAL Token - Quick Setup Guide
A simple guide to deploy and manage the RWAL governance token with cross-chain bridging.

Quick Start
1. Setup
bash
git clone https://github.com/Lendr-Network/RWAL-Token.git
cd rwal-token
npm install

2. Environment
Create .env file:

text
PRIVATE_KEY=your_private_key_here
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545/
AVALANCHE_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc
SEPOLIA_RPC=https://ethereum-sepolia.publicnode.com

# After deployment, add these:
RWAL_TOKEN_BSC=
RWAL_TOKEN_FUJI=
RWAL_TOKEN_SEPOLIA=

3. Deploy
bash
# Compile
npx hardhat compile

# Test
npx hardhat test

# Deploy to BSC Testnet
npx hardhat run scripts/deploy/Deploy-RWAL.ts --network bscTestnet
4. Verify
bash
# Verify deployment
npx hardhat run scripts/verify/Verify-RWAL.ts --network bscTestnet

# Deploy implementation(upgrade) (if needed)
npx hardhat run scripts/deploy/Upgrade-RWAL.ts --network bscTestnet

# Verify upgrade (if needed)
npx hardhat run scripts/verify/Verify-upgrade.ts --network bscTestnet


Essential Commands
bash
# Deploy
npx hardhat run scripts/deploy/Deploy-RWAL.ts --network bscTestnet

# Upgrade  
npx hardhat run scripts/deploy/Upgrade-RWAL.ts --network bscTestnet

# Verify Deployment
npx hardhat run scripts/verify/Verify-RWAL.ts --network bscTestnet

# Verify Upgrade
npx hardhat run scripts/verify/Verify-upgrade.ts --network bscTestnet

# Test
npx hardhat test
npx hardhat coverage


Success Checklist
    100M RWAL tokens minted
    UUPS proxy deployed
    Test coverage >95%
    Implementation verified on explorer
    Cross-chain pools deployed

Block Explorers
    BSC Testnet: https://testnet.bscscan.com/
    Avalanche Fuji: https://testnet.snowtrace.io/
    Sepolia: https://sepolia.etherscan.io/

RWAL Token Features
    Fixed 100M Supply - Pre-minted governance token
    ERC20Votes - Governance and delegation capabilities
    UUPS Upgradeable - Gas-efficient upgrade pattern
    Chainlink CCIP - Cross-chain bridging support
    Role-Based Access - Granular permission system
    Emergency Controls - Pause and recovery mechanisms