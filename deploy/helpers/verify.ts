import { HardhatRuntimeEnvironment } from 'hardhat/types';

async function verify(env: HardhatRuntimeEnvironment, args: any) {
  try {
    return await env.run('verify:verify', args);
  } catch (e) {
    console.error(e);
  }
}

verify.skip = async (hre: HardhatRuntimeEnvironment) => true;

export default verify;
