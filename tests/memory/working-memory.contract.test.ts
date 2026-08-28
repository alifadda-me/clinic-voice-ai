import { defineWorkingMemoryContract } from './working-memory.contract.js';
import { InMemoryWorkingMemory } from '../../src/infrastructure/memory/platform/adapters.js';

defineWorkingMemoryContract(
  'InMemoryWorkingMemory',
  () => new InMemoryWorkingMemory(),
);
