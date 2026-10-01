import { captureLogs } from '../../src/log.js';

// The suite does not print a JSON line for every tool call and request.
// Tests that check logs nest their own captureLogs() and restore it.
captureLogs();
