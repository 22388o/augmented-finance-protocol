import { evmRevert, evmSnapshot, DRE, falsyOrZeroAddress } from '../../../helpers/misc-utils';
import { Signer } from 'ethers';
import {
  getMarketAddressController,
  getProtocolDataProvider,
  getDepositToken,
  getMintableERC20,
  getLendingPoolConfiguratorProxy,
  getMockPriceOracle,
  getAddressesProviderRegistry,
  getWETHMocked,
  getWETHGateway,
  getUniswapLiquiditySwapAdapter,
  getUniswapRepayAdapter,
  getFlashLiquidationAdapter,
  getLendingPoolProxy,
} from '../../../helpers/contracts-getters';
import { eEthereumNetwork, tEthereumAddress } from '../../../helpers/types';
import { LendingPool } from '../../../types/LendingPool';
import { ProtocolDataProvider } from '../../../types/ProtocolDataProvider';
import { MintableERC20 } from '../../../types/MintableERC20';
import { DepositToken } from '../../../types/DepositToken';
import { LendingPoolConfigurator } from '../../../types/LendingPoolConfigurator';

import chai from 'chai';
// @ts-ignore
import bignumberChai from 'chai-bignumber';
import { almostEqual } from './almost-equal';
import { MockPriceOracle } from '../../../types/MockPriceOracle';
import { AddressesProviderRegistry } from '../../../types/AddressesProviderRegistry';
import { getEthersSigners } from '../../../helpers/contracts-helpers';
import { UniswapLiquiditySwapAdapter } from '../../../types/UniswapLiquiditySwapAdapter';
import { UniswapRepayAdapter } from '../../../types/UniswapRepayAdapter';
import { getParamPerNetwork } from '../../../helpers/contracts-helpers';
import { WETH9Mocked } from '../../../types/WETH9Mocked';
import { WETHGateway } from '../../../types/WETHGateway';
import { solidity } from 'ethereum-waffle';
import { FlashLiquidationAdapter, MarketAccessController } from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';
import { AccessFlags } from '../../../helpers/access-flags';
import { TestConfig } from '../../../markets/augmented';

chai.use(bignumberChai());
chai.use(almostEqual());
chai.use(solidity);

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}
export interface TestEnv {
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
  pool: LendingPool;
  configurator: LendingPoolConfigurator;
  oracle: MockPriceOracle;
  helpersContract: ProtocolDataProvider;
  weth: WETH9Mocked;
  aWETH: DepositToken;
  dai: MintableERC20;
  aDai: DepositToken;
  usdc: MintableERC20;
  aave: MintableERC20;
  addressesProvider: MarketAccessController;
  uniswapLiquiditySwapAdapter: UniswapLiquiditySwapAdapter;
  uniswapRepayAdapter: UniswapRepayAdapter;
  registry: AddressesProviderRegistry;
  wethGateway: WETHGateway;
  flashLiquidationAdapter: FlashLiquidationAdapter;
}

let buidlerevmSnapshotId: string = '0x1';
const setBuidlerevmSnapshotId = (id: string) => {
  buidlerevmSnapshotId = id;
};

const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  pool: {} as LendingPool,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as ProtocolDataProvider,
  oracle: {} as MockPriceOracle,
  weth: {} as WETH9Mocked,
  aWETH: {} as DepositToken,
  dai: {} as MintableERC20,
  aDai: {} as DepositToken,
  usdc: {} as MintableERC20,
  aave: {} as MintableERC20,
  addressesProvider: {} as MarketAccessController,
  uniswapLiquiditySwapAdapter: {} as UniswapLiquiditySwapAdapter,
  uniswapRepayAdapter: {} as UniswapRepayAdapter,
  flashLiquidationAdapter: {} as FlashLiquidationAdapter,
  registry: {} as AddressesProviderRegistry,
  wethGateway: {} as WETHGateway,
} as TestEnv;

export async function initializeMakeSuite() {
  const [_deployer, ...restSigners] = await getEthersSigners();
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;

  if (process.env.MAINNET_FORK === 'true') {
    testEnv.registry = await getAddressesProviderRegistry(
      getParamPerNetwork(TestConfig.ProviderRegistry, eEthereumNetwork.main)
    );
  } else {
    testEnv.registry = await getAddressesProviderRegistry();
  }

  testEnv.addressesProvider = await getMarketAddressController();
  // testEnv.registry.getAddressesProviderByAddress(address);

  testEnv.oracle = await getMockPriceOracle(await testEnv.addressesProvider.getPriceOracle());

  testEnv.pool = await getLendingPoolProxy(await testEnv.addressesProvider.getLendingPool());
  testEnv.configurator = await getLendingPoolConfiguratorProxy(
    await testEnv.addressesProvider.getAddress(AccessFlags.LENDING_POOL_CONFIGURATOR)
  );

  testEnv.helpersContract = await getProtocolDataProvider();

  const allTokens = (await testEnv.helpersContract.getAllTokenDescriptions(true)).tokens;

  const findToken = (sym: string) => {
    const desc = allTokens.find((depositToken) => depositToken.tokenSymbol === sym);
    if (falsyOrZeroAddress(desc?.token)) {
      console.log(allTokens);
      throw 'missing token ' + sym;
    }
    return desc!.token;
  };

  const aDaiAddress = findToken('agDAI');
  const aWEthAddress = findToken('agWETH');

  const daiAddress = findToken('DAI');
  const usdcAddress = findToken('USDC');
  const aaveAddress = findToken('AAVE');
  const wethAddress = findToken('WETH');

  if (!aDaiAddress || !aWEthAddress) {
    console.log('Required test tokens are missing');
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress || !aaveAddress || !wethAddress) {
    console.log('Required test tokens are missing');
    process.exit(1);
  }

  testEnv.aDai = await getDepositToken(aDaiAddress);
  testEnv.aWETH = await getDepositToken(aWEthAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getMintableERC20(usdcAddress);
  testEnv.aave = await getMintableERC20(aaveAddress);
  testEnv.weth = await getWETHMocked(wethAddress);
  testEnv.wethGateway = await getWETHGateway();

  testEnv.uniswapLiquiditySwapAdapter = await getUniswapLiquiditySwapAdapter();
  testEnv.uniswapRepayAdapter = await getUniswapRepayAdapter();
  testEnv.flashLiquidationAdapter = await getFlashLiquidationAdapter();
}

const setSnapshot = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  if (usingTenderly()) {
    setBuidlerevmSnapshotId((await (<any>hre).tenderlyNetwork.getHead()) || '0x1');
    return;
  }
  setBuidlerevmSnapshotId(await evmSnapshot());
};

const revertHead = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  if (usingTenderly()) {
    await (<any>hre).tenderlyNetwork.setHead(buidlerevmSnapshotId);
    return;
  }
  await evmRevert(buidlerevmSnapshotId);
};

export function makeSuite(name: string, tests: (testEnv: TestEnv) => void) {
  describe(name, () => {
    before(async () => {
      await setSnapshot();
    });
    tests(testEnv);
    after(async () => {
      await revertHead();
    });
  });
}
