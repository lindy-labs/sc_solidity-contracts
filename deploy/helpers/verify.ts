import { HardhatRuntimeEnvironment } from 'hardhat/types';

export default async function (env: HardhatRuntimeEnvironment, args: any) {
  try {
    return await env.run('verify:verify', args);
  } catch (e) {
    console.error(e);
  }
}
