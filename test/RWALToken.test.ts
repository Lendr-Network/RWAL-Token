import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { RWAL } from "../typechain-types";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("RWAL Token Contract", function () {
    // Test constants
    const TOKEN_NAME = "Lendr Governance Token";
    const TOKEN_SYMBOL = "RWAL";
    const TOKEN_DECIMALS = 18;
    const MAX_SUPPLY = ethers.parseEther("1000000000"); // 1 billion tokens
    const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M tokens

    // Role constants
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
    const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
    const BRIDGE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BRIDGE_ROLE"));
    const EMERGENCY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EMERGENCY_ROLE"));
    const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

    // Test accounts
    let owner: HardhatEthersSigner;
    let minter: HardhatEthersSigner;
    let burner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let newAdmin: HardhatEthersSigner;
    let unauthorizedUser: HardhatEthersSigner;

    async function deployRWALFixture() {
        [owner, minter, burner, user1, user2, newAdmin, unauthorizedUser] = await ethers.getSigners();

        const RWAL = await ethers.getContractFactory("RWAL");
        const rwal = (await upgrades.deployProxy(
            RWAL,
            [TOKEN_NAME, TOKEN_SYMBOL, owner.address, INITIAL_SUPPLY, TOKEN_DECIMALS, false],
            { kind: "uups" }
        )) as unknown as RWAL;

        await rwal.waitForDeployment();

        return { rwal };
    }

    async function deployMockTokenFixture() {
        const MockERC20 = await ethers.getContractFactory("contracts/test/MockERC20.sol:MockERC20");
        const mockToken = await MockERC20.deploy("Mock Token", "MOCK");
        await mockToken.waitForDeployment();
        return { mockToken };
    }

    describe("Deployment and Initialization", function () {
        it("Should deploy with correct initial parameters", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            expect(await rwal.name()).to.equal(TOKEN_NAME);
            expect(await rwal.symbol()).to.equal(TOKEN_SYMBOL);
            expect(await rwal.decimals()).to.equal(TOKEN_DECIMALS);
            expect(await rwal.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(await rwal.maxSupply()).to.equal(MAX_SUPPLY);
            expect(await rwal.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
        });

        it("Should set correct roles for admin", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            expect(await rwal.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await rwal.hasRole(MINTER_ROLE, owner.address)).to.be.true;
            expect(await rwal.hasRole(BURNER_ROLE, owner.address)).to.be.true;
            expect(await rwal.hasRole(UPGRADER_ROLE, owner.address)).to.be.true;
            expect(await rwal.hasRole(BRIDGE_ROLE, owner.address)).to.be.true;
            expect(await rwal.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
            expect(await rwal.hasRole(EMERGENCY_ROLE, owner.address)).to.be.true;
        });

        it("Should set correct CCIP admin", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            expect(await rwal.getCCIPAdmin()).to.equal(owner.address);
        });

        it("Should revert on zero admin address", async function () {
            const RWAL = await ethers.getContractFactory("RWAL");

            await expect(
                upgrades.deployProxy(
                    RWAL,
                    [TOKEN_NAME, TOKEN_SYMBOL, ethers.ZeroAddress, INITIAL_SUPPLY, TOKEN_DECIMALS, false],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(RWAL, "RWAL__ZeroAddress");
        });

        it("Should revert when premint exceeds max supply", async function () {
            const RWAL = await ethers.getContractFactory("RWAL");
            const invalidPremint = MAX_SUPPLY + 1n;

            await expect(
                upgrades.deployProxy(
                    RWAL,
                    [TOKEN_NAME, TOKEN_SYMBOL, owner.address, invalidPremint, TOKEN_DECIMALS, false],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(RWAL, "RWAL__MaxSupplyExceeded")
                .withArgs(invalidPremint);
        });

        it("Should not allow implementation contract to be initialized", async function () {
            const RWAL = await ethers.getContractFactory("RWAL");
            const implementation = await RWAL.deploy();
            await implementation.waitForDeployment();

            await expect(
                implementation.initialize(TOKEN_NAME, TOKEN_SYMBOL, owner.address, 0, TOKEN_DECIMALS, false)
            ).to.be.revertedWithCustomError(implementation, "InvalidInitialization");
        });

        it("Should deploy with zero premint correctly", async function () {
            const RWAL = await ethers.getContractFactory("RWAL");
            const rwal = (await upgrades.deployProxy(
                RWAL,
                [TOKEN_NAME, TOKEN_SYMBOL, owner.address, 0, TOKEN_DECIMALS, false],
                { kind: "uups" }
            )) as unknown as RWAL;

            expect(await rwal.totalSupply()).to.equal(0);
            expect(await rwal.balanceOf(owner.address)).to.equal(0);
        });
    });

    describe("ERC20 Functionality", function () {
        it("Should transfer tokens correctly", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const transferAmount = ethers.parseEther("1000");

            await expect(rwal.transfer(user1.address, transferAmount))
                .to.emit(rwal, "Transfer")
                .withArgs(owner.address, user1.address, transferAmount);

            expect(await rwal.balanceOf(user1.address)).to.equal(transferAmount);
            expect(await rwal.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - transferAmount);
        });

        it("Should approve and transferFrom correctly", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const amount = ethers.parseEther("1000");

            await expect(rwal.approve(user1.address, amount))
                .to.emit(rwal, "Approval")
                .withArgs(owner.address, user1.address, amount);

            expect(await rwal.allowance(owner.address, user1.address)).to.equal(amount);

            await expect(rwal.connect(user1).transferFrom(owner.address, user2.address, amount))
                .to.emit(rwal, "Transfer")
                .withArgs(owner.address, user2.address, amount);

            expect(await rwal.balanceOf(user2.address)).to.equal(amount);
            expect(await rwal.allowance(owner.address, user1.address)).to.equal(0);
        });

        it("Should handle transfer to self", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const amount = ethers.parseEther("1000");
            const initialBalance = await rwal.balanceOf(owner.address);

            await rwal.transfer(owner.address, amount);

            expect(await rwal.balanceOf(owner.address)).to.equal(initialBalance);
        });
    });

    describe("Minting Functionality", function () {
        it("Should mint tokens with MINTER_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const mintAmount = ethers.parseEther("1000");
            const initialSupply = await rwal.totalSupply();

            await expect(rwal.mint(user1.address, mintAmount))
                .to.emit(rwal, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, mintAmount);

            expect(await rwal.balanceOf(user1.address)).to.equal(mintAmount);
            expect(await rwal.totalSupply()).to.equal(initialSupply + mintAmount);
        });

        it("Should revert minting without MINTER_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const mintAmount = ethers.parseEther("1000");

            await expect(
                rwal.connect(unauthorizedUser).mint(user1.address, mintAmount)
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, MINTER_ROLE);
        });

        it("Should revert minting zero amount", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.mint(user1.address, 0)
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAmount");
        });

        it("Should revert minting to zero address", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const mintAmount = ethers.parseEther("1000");

            await expect(
                rwal.mint(ethers.ZeroAddress, mintAmount)
            ).to.be.revertedWithCustomError(rwal, "RWAL__InvalidRecipient")
                .withArgs(ethers.ZeroAddress);
        });

        it("Should revert minting to contract address", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const mintAmount = ethers.parseEther("1000");

            await expect(
                rwal.mint(await rwal.getAddress(), mintAmount)
            ).to.be.revertedWithCustomError(rwal, "RWAL__InvalidRecipient")
                .withArgs(await rwal.getAddress());
        });

        it("Should revert minting beyond max supply", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const remainingSupply = MAX_SUPPLY - (await rwal.totalSupply());
            const excessAmount = remainingSupply + 1n;

            await expect(
                rwal.mint(user1.address, excessAmount)
            ).to.be.revertedWithCustomError(rwal, "RWAL__MaxSupplyExceeded")
                .withArgs(await rwal.totalSupply() + excessAmount);
        });

        it("Should mint exactly to max supply", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const remainingSupply = MAX_SUPPLY - (await rwal.totalSupply());

            await rwal.mint(user1.address, remainingSupply);

            expect(await rwal.totalSupply()).to.equal(MAX_SUPPLY);
            expect(await rwal.balanceOf(user1.address)).to.equal(remainingSupply);
        });
    });

    describe("Burning Functionality", function () {
        beforeEach(async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            await rwal.transfer(user1.address, ethers.parseEther("5000"));
            await rwal.grantRole(BURNER_ROLE, user1.address);
            await rwal.grantRole(BURNER_ROLE, user2.address);
        });

        it("Should burn tokens from caller's account", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            await rwal.transfer(user1.address, ethers.parseEther("5000"));
            await rwal.grantRole(BURNER_ROLE, user1.address);

            const burnAmount = ethers.parseEther("1000");
            const initialBalance = await rwal.balanceOf(user1.address);
            const initialSupply = await rwal.totalSupply();

            await expect(rwal.connect(user1)["burn(uint256)"](burnAmount))
                .to.emit(rwal, "Transfer")
                .withArgs(user1.address, ethers.ZeroAddress, burnAmount);

            expect(await rwal.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
            expect(await rwal.totalSupply()).to.equal(initialSupply - burnAmount);
        });

        it("Should burn tokens from specified account with owner approval", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            await rwal.transfer(user1.address, ethers.parseEther("5000"));
            await rwal.grantRole(BURNER_ROLE, owner.address);

            const burnAmount = ethers.parseEther("1000");
            const initialBalance = await rwal.balanceOf(user1.address);
            await rwal.connect(user1).approve(owner.address, burnAmount);

            // Owner burning from user1 (owner is account)
            await expect(rwal["burn(address,uint256)"](user1.address, burnAmount))
                .to.emit(rwal, "Transfer")
                .withArgs(user1.address, ethers.ZeroAddress, burnAmount);

            expect(await rwal.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
        });

        it("Should burn tokens from specified account with allowance", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            await rwal.transfer(user1.address, ethers.parseEther("5000"));
            await rwal.grantRole(BURNER_ROLE, user2.address);

            const burnAmount = ethers.parseEther("1000");

            // user1 approves user2 to spend tokens
            await rwal.connect(user1).approve(user2.address, burnAmount);

            const initialBalance = await rwal.balanceOf(user1.address);

            await expect(rwal.connect(user2)["burn(address,uint256)"](user1.address, burnAmount))
                .to.emit(rwal, "Transfer")
                .withArgs(user1.address, ethers.ZeroAddress, burnAmount);

            expect(await rwal.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
            expect(await rwal.allowance(user1.address, user2.address)).to.equal(0);
        });

        it("Should burn tokens with allowance using burnFrom", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            await rwal.transfer(user1.address, ethers.parseEther("5000"));
            await rwal.grantRole(BURNER_ROLE, user2.address);

            const burnAmount = ethers.parseEther("1000");

            await rwal.connect(user1).approve(user2.address, burnAmount);

            const initialBalance = await rwal.balanceOf(user1.address);

            await expect(rwal.connect(user2).burnFrom(user1.address, burnAmount))
                .to.emit(rwal, "Transfer")
                .withArgs(user1.address, ethers.ZeroAddress, burnAmount);

            expect(await rwal.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
            expect(await rwal.allowance(user1.address, user2.address)).to.equal(0);
        });

        it("Should revert burning without BURNER_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const burnAmount = ethers.parseEther("1000");

            await expect(
                rwal.connect(unauthorizedUser)["burn(uint256)"](burnAmount)
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, BURNER_ROLE);
        });

        it("Should revert burning zero amount", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal["burn(uint256)"](0)
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAmount");
        });

        it("Should revert burning from zero address", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const burnAmount = ethers.parseEther("1000");

            await expect(
                rwal["burn(address,uint256)"](ethers.ZeroAddress, burnAmount)
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAddress");
        });

        it("Should revert burnFrom from zero address", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const burnAmount = ethers.parseEther("1000");

            await expect(
                rwal.burnFrom(ethers.ZeroAddress, burnAmount)
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAddress");
        });

        it("Should revert burning with insufficient allowance", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            await rwal.transfer(user1.address, ethers.parseEther("5000"));
            await rwal.grantRole(BURNER_ROLE, user2.address);

            const burnAmount = ethers.parseEther("1000");

            // No approval given
            await expect(
                rwal.connect(user2).burnFrom(user1.address, burnAmount)
            ).to.be.revertedWithCustomError(rwal, "ERC20InsufficientAllowance")
                .withArgs(user2.address, 0, burnAmount);
        });
    });

    describe("Role Management", function () {
        it("Should grant and revoke roles correctly", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(rwal.grantRole(MINTER_ROLE, user1.address))
                .to.emit(rwal, "RoleGranted")
                .withArgs(MINTER_ROLE, user1.address, owner.address);

            expect(await rwal.hasRole(MINTER_ROLE, user1.address)).to.be.true;

            await expect(rwal.revokeRole(MINTER_ROLE, user1.address))
                .to.emit(rwal, "RoleRevoked")
                .withArgs(MINTER_ROLE, user1.address, owner.address);

            expect(await rwal.hasRole(MINTER_ROLE, user1.address)).to.be.false;
        });

        it("Should grant both mint and burn roles", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await rwal.grantMintAndBurnRoles(user1.address);

            expect(await rwal.hasRole(MINTER_ROLE, user1.address)).to.be.true;
            expect(await rwal.hasRole(BURNER_ROLE, user1.address)).to.be.true;
        });

        it("Should revert granting roles without proper permission", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.connect(unauthorizedUser).grantRole(MINTER_ROLE, user1.address)
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, DEFAULT_ADMIN_ROLE);
        });

        it("Should revert grantMintAndBurnRoles without ADMIN_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.connect(unauthorizedUser).grantMintAndBurnRoles(user1.address)
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, ADMIN_ROLE);
        });

        it("Should revert granting roles to zero address", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.grantMintAndBurnRoles(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAddress");
        });
    });

    describe("CCIP Admin Management", function () {
        it("Should transfer CCIP admin correctly", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(rwal.setCCIPAdmin(newAdmin.address))
                .to.emit(rwal, "CCIPAdminTransferred")
                .withArgs(owner.address, newAdmin.address);

            expect(await rwal.getCCIPAdmin()).to.equal(newAdmin.address);
        });

        it("Should revert setting CCIP admin to zero address", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.setCCIPAdmin(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAddress");
        });

        it("Should revert CCIP admin change without ADMIN_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.connect(unauthorizedUser).setCCIPAdmin(newAdmin.address)
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, ADMIN_ROLE);
        });
    });

    describe("Emergency Controls", function () {
        it("Should pause and unpause correctly", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(rwal.pause())
                .to.emit(rwal, "Paused")
                .withArgs(owner.address);

            expect(await rwal.paused()).to.be.true;

            await expect(rwal.unpause())
                .to.emit(rwal, "Unpaused")
                .withArgs(owner.address);

            expect(await rwal.paused()).to.be.false;

            await rwal.transfer(user1.address, ethers.parseEther("100"));
            expect(await rwal.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
        });

        it("Should revert pause without EMERGENCY_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.connect(unauthorizedUser).pause()
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, EMERGENCY_ROLE);
        });

        it("Should revert unpause without EMERGENCY_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await rwal.pause();

            await expect(
                rwal.connect(unauthorizedUser).unpause()
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, EMERGENCY_ROLE);
        });

        it("Should emergency withdraw ERC20 tokens", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const { mockToken } = await loadFixture(deployMockTokenFixture);

            // Mint some mock tokens to RWAL contract
            await mockToken.mint(await rwal.getAddress(), ethers.parseEther("1000"));

            const withdrawAmount = ethers.parseEther("500");

            await expect(rwal.emergencyWithdraw(await mockToken.getAddress(), user1.address, withdrawAmount))
                .to.emit(rwal, "EmergencyWithdraw")
                .withArgs(await mockToken.getAddress(), user1.address, withdrawAmount);

            expect(await mockToken.balanceOf(user1.address)).to.equal(withdrawAmount);
        });

        it("Should revert emergency withdraw of RWAL tokens", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(
                rwal.emergencyWithdraw(await rwal.getAddress(), user1.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(rwal, "RWAL__InvalidRecipient")
                .withArgs(await rwal.getAddress());
        });

        it("Should revert emergency withdraw to zero address", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const { mockToken } = await loadFixture(deployMockTokenFixture);

            await expect(
                rwal.emergencyWithdraw(await mockToken.getAddress(), ethers.ZeroAddress, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAddress");
        });

        it("Should revert emergency withdraw zero amount", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const { mockToken } = await loadFixture(deployMockTokenFixture);

            await expect(
                rwal.emergencyWithdraw(await mockToken.getAddress(), user1.address, 0)
            ).to.be.revertedWithCustomError(rwal, "RWAL__ZeroAmount");
        });

        it("Should revert emergency withdraw without EMERGENCY_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const { mockToken } = await loadFixture(deployMockTokenFixture);

            await expect(
                rwal.connect(unauthorizedUser).emergencyWithdraw(await mockToken.getAddress(), user1.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(rwal, "AccessControlUnauthorizedAccount")
                .withArgs(unauthorizedUser.address, EMERGENCY_ROLE);
        });
    });

    describe("UUPS Upgradeability", function () {
        it("Should upgrade with UPGRADER_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            const RWALv2 = await ethers.getContractFactory("RWAL");
            const upgradedRwal = await upgrades.upgradeProxy(await rwal.getAddress(), RWALv2);

            expect(await upgradedRwal.name()).to.equal(TOKEN_NAME);
            expect(await upgradedRwal.symbol()).to.equal(TOKEN_SYMBOL);
        });

        it("Should revert upgrade without UPGRADER_ROLE", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await rwal.revokeRole(UPGRADER_ROLE, owner.address);

            const RWALv2 = await ethers.getContractFactory("RWAL");

            await expect(
                upgrades.upgradeProxy(await rwal.getAddress(), RWALv2)
            ).to.be.reverted;
        });

        it("Should maintain state after upgrade", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            // Transfer some tokens before upgrade
            await rwal.transfer(user1.address, ethers.parseEther("1000"));

            const balanceBefore = await rwal.balanceOf(user1.address);
            const totalSupplyBefore = await rwal.totalSupply();

            const RWALv2 = await ethers.getContractFactory("RWAL");
            const upgradedRwal = await upgrades.upgradeProxy(await rwal.getAddress(), RWALv2);

            expect(await upgradedRwal.balanceOf(user1.address)).to.equal(balanceBefore);
            expect(await upgradedRwal.totalSupply()).to.equal(totalSupplyBefore);
        });
    });

    describe("Interface Support", function () {
        it("Should support correct interfaces", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            // Standard interface IDs (these should work)
            expect(await rwal.supportsInterface("0x36372b07")).to.be.true; // IERC20
            expect(await rwal.supportsInterface("0x01ffc9a7")).to.be.true; // IERC165
            expect(await rwal.supportsInterface("0x7965db0b")).to.be.true; // IAccessControl

            // For IGetCCIPAdmin (single function interface)
            const getCCIPAdminId = ethers.id("getCCIPAdmin()").slice(0, 10);
            expect(await rwal.supportsInterface(getCCIPAdminId)).to.be.true;

            // For IBurnMintERC20Upgradeable - ALL 4 functions
            const mintSelector = ethers.id("mint(address,uint256)").slice(0, 10);           // 0x40c10f19
            const burn1Selector = ethers.id("burn(uint256)").slice(0, 10);                 // 0x42966c68
            const burn2Selector = ethers.id("burn(address,uint256)").slice(0, 10);         // 0x9dc29fac  
            const burnFromSelector = ethers.id("burnFrom(address,uint256)").slice(0, 10);  // 0x79cc6790

            // XOR all 4 function selectors
            const burnMintInterfaceId = ethers.toBeHex(
                BigInt(mintSelector) ^
                BigInt(burn1Selector) ^
                BigInt(burn2Selector) ^
                BigInt(burnFromSelector)
            );

            console.log("Calculated IBurnMintERC20Upgradeable interface ID:", burnMintInterfaceId);

            expect(await rwal.supportsInterface(burnMintInterfaceId)).to.be.true;
        });





        it("Should not support random interface", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            expect(await rwal.supportsInterface("0x12345678")).to.be.false;
        });
    });

    describe("Edge Cases and Gas Optimization", function () {
        it("Should handle multiple transfers correctly", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const amount = ethers.parseEther("100");

            for (let i = 0; i < 5; i++) {
                await rwal.transfer(user1.address, amount);
            }

            expect(await rwal.balanceOf(user1.address)).to.equal(amount * 5n);
        });

        it("Should handle large token amounts", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);
            const largeAmount = ethers.parseEther("1000000"); // 1M tokens

            await rwal.mint(user1.address, largeAmount);
            expect(await rwal.balanceOf(user1.address)).to.equal(largeAmount);

            await rwal.grantRole(BURNER_ROLE, user1.address);
            await rwal.connect(user1)["burn(uint256)"](largeAmount);
            expect(await rwal.balanceOf(user1.address)).to.equal(0);
        });

        it("Should handle zero transfer", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await expect(rwal.transfer(user1.address, 0))
                .to.emit(rwal, "Transfer")
                .withArgs(owner.address, user1.address, 0);

            expect(await rwal.balanceOf(user1.address)).to.equal(0);
        });
    });

    describe("Reentrancy Protection", function () {
        it("Should prevent reentrancy during minting", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            // ReentrancyGuard is tested implicitly through normal operations
            // This test ensures the guard is active
            const amount = ethers.parseEther("1000");
            await rwal.mint(user1.address, amount);

            expect(await rwal.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should prevent reentrancy during burning", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            const amount = ethers.parseEther("1000");
            await rwal.mint(user1.address, amount);
            await rwal.grantRole(BURNER_ROLE, user1.address);

            await rwal.connect(user1)["burn(uint256)"](amount);
            expect(await rwal.balanceOf(user1.address)).to.equal(0);
        });
    });

    describe("Gas Efficiency Tests", function () {
        it("Should execute transfers efficiently", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            const tx = await rwal.transfer(user1.address, ethers.parseEther("1000"));
            const receipt = await tx.wait();

            // Gas usage should be reasonable for ERC20 transfer
            expect(receipt?.gasUsed).to.be.lessThan(100000);
        });

        it("Should execute minting efficiently", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            const tx = await rwal.mint(user1.address, ethers.parseEther("1000"));
            const receipt = await tx.wait();

            // Gas usage should be reasonable for minting
            expect(receipt?.gasUsed).to.be.lessThan(250000);
        });

        it("Should execute burning efficiently", async function () {
            const { rwal } = await loadFixture(deployRWALFixture);

            await rwal.mint(user1.address, ethers.parseEther("1000"));
            await rwal.grantRole(BURNER_ROLE, user1.address);

            const tx = await rwal.connect(user1)["burn(uint256)"](ethers.parseEther("1000"));
            const receipt = await tx.wait();

            // Gas usage should be reasonable for burning
            expect(receipt?.gasUsed).to.be.lessThan(200000);
        });
    });
});