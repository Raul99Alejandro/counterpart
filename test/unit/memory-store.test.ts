import { runStoreContract } from '../contract/store-contract.js';
import { MemoryStore } from '../../src/store/memory.js';

runStoreContract('MemoryStore', async () => new MemoryStore());
