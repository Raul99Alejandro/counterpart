import { captureLogs } from '../../src/log.js';

// La suite no imprime una línea JSON por cada tool y petición.
// Las pruebas que verifican logs anidan su propio captureLogs() y lo restauran.
captureLogs();
