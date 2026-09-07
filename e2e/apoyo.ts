import { Page, expect } from '@playwright/test';

/** Valores sintéticos. Ninguno corresponde a una persona ni a un recurso real. */
export const SINTETICOS = {
  documento: 'DOCUMENTO-TEST-A6-99887766',
  medicamento: 'MEDICAMENTO-TEST-A6',
  hoja: 'https://drive.google.com/test-spreadsheet-A6',
};

export const CLAVES_PRESERVADAS = ['pate:prefs:v1', 'pate_salud_device_id', 'pate:prefs:migrado'];

/**
 * Corta todo tráfico hacia Google. Garantiza que ninguna prueba pueda iniciar
 * un flujo OAuth real ni contactar Firebase, pase lo que pase en la app.
 */
export async function bloquearGoogle(page: Page) {
  await page.route(/(accounts|apis)\.google\.com|googleapis\.com|firebaseio\.com|gstatic\.com/, (r) => r.abort());
}

/** Entra por el modo demostración de la app: sin cuenta, sin OAuth, sin red. */
export async function entrarEnModoDemo(page: Page) {
  await page.goto('/login');
  // El servidor de pruebas no expone Client ID de Google, asi que la pantalla
  // muestra el fallback de demostracion: no existe ni el boton de Google.
  await page.getByRole('button', { name: /Continuar con Sesi.n Demo|Modo Demostraci/i }).first().click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Cerrar Sesión' })).toBeVisible();
}

/**
 * Sesión de ORIGEN REAL simulada, sin OAuth ni credenciales.
 *
 * Desde A6-F3 el modo demostración no puede generar cambios pendientes: la
 * guarda estructural detiene `scheduleAutoSync` antes de contar nada. Eso es
 * lo correcto, pero deja sin forma de ejercitar el diálogo de cambios
 * pendientes de A6-F2.
 *
 * Este arnés siembra un usuario sintético con `provider: 'google'`, de modo que
 * la app lo trate como origen REAL. No hay token, ni cuenta, ni red: el tráfico
 * hacia Google sigue bloqueado y toda llamada falla, que es justo la condición
 * que produce cambios pendientes.
 */
export async function entrarComoSesionRealSimulada(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => {
    const usuario = {
      id: 'user-e2e-real',
      googleId: 'e2e-google-id',
      email: 'sesion-e2e@example.invalid',
      displayName: 'Sesion E2E',
      photoUrl: null,
      provider: 'google',
      createdAt: new Date().toISOString(),
      loggedAt: new Date().toISOString(),
    };
    localStorage.setItem('pate_salud_active_user', JSON.stringify(usuario));
    localStorage.setItem(
      'pate-salud-state:e2e-google-id',
      JSON.stringify({
        schemaVersion: 1,
        origen: 'REAL',
        user: usuario,
        members: [], healthProfiles: {}, appointments: [], checkups: [], vaccines: [],
        exams: [], examResults: {}, documents: [], history: [], reminders: [], tasks: [],
        medicalOrders: [], medicationPrescriptions: [], medicationDoseReminders: [],
        appointmentCandidates: [], sharedReports: [], emailSources: [],
        driveSyncEnabled: true, calendarSyncEnabled: true, lastExportMetadata: null,
        // Evita el desvío a /onboarding/setup, que exige una hoja configurada.
        databaseSpreadsheetId: 'hoja-e2e-inexistente',
        databaseSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/hoja-e2e-inexistente',
      }),
    );
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Cerrar Sesión' })).toBeVisible({ timeout: 30_000 });
}

/** Siembra claves sintéticas, incluidas las que deben sobrevivir y las ajenas. */
export async function sembrarAlmacenamiento(page: Page) {
  await page.evaluate((s) => {
    const expediente = JSON.stringify({
      schemaVersion: 1,
      members: [{ id: 'm1', fullName: 'Sintetico', documentNumber: s.documento }],
      medicationPrescriptions: [{ id: 'p1', name: s.medicamento }],
      databaseSpreadsheetUrl: s.hoja,
    });
    localStorage.setItem('pate-salud-state:test@example.invalid', expediente);
    localStorage.setItem('pate_salud_active_user', JSON.stringify({ email: 'test@example.invalid' }));
    localStorage.setItem('pate_salud_familiar_app_state_demo', expediente);
    localStorage.setItem('pate_salud_appdata_boundary', 'x');
    localStorage.setItem('pate-futuro-test', 'clave de una version futura');
    // Preservadas
    localStorage.setItem('pate:prefs:v1', JSON.stringify({ autoLockMinutes: 7 }));
    localStorage.setItem('pate_salud_device_id', 'dispositivo-e2e');
    localStorage.setItem('pate:prefs:migrado', '1');
    // Ajena a Paté
    localStorage.setItem('otra-app:sesion', 'no tocar');
  }, SINTETICOS);
}

export async function volcarAlmacenamiento(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      out[k] = localStorage.getItem(k) ?? '';
    }
    return out;
  });
}

/** Crea cambios pendientes de sincronizar por la vía real de la aplicación. */
export async function generarCambiosPendientes(page: Page) {
  await page.goto('/members/new');
  await page.getByPlaceholder('Ej. Juan Pérez').fill('Paciente Sintetico A6');
  // El numero de documento es obligatorio y debe ser unico entre miembros.
  await page.getByPlaceholder(/Ej\. 10203/).fill(String(Date.now()).slice(-9));
  await page.getByRole('button', { name: 'Guardar Familiar' }).click();
  await page.waitForURL(/\/members/, { timeout: 20_000 });
  // scheduleAutoSync usa un debounce de 4 s; sin token incrementa pendingSyncCount.
  await page.waitForTimeout(5500);
}
