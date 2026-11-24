import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { configure } from '@testing-library/react';

expect.extend(matchers);

// Test files run in parallel, so on a busy machine the default 1-second wait for async UI can run out.
configure({ asyncUtilTimeout: 4000 });
