/**
 * Google Drive appDataFolder API Client Layer
 * Handles authentication requests, searching, reading, and writing configuration files
 * in the application's hidden configuration folder.
 * Scope: https://www.googleapis.com/auth/drive.appdata
 */

let tokenClient: any = null;
let tokenCallback: ((token: string) => void) | null = null;
let tokenErrorCallback: ((err: any) => void) | null = null;

/**
 * Triggers the Google Identity Services popup to request drive.appdata permissions.
 * Keeps the token in memory and returns it via a Promise.
 */
export function requestAppDataPermission(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Cannot request permission on server side.'));
    }

    if (!(window as any).google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services library is not loaded.'));
    }

    tokenCallback = resolve;
    tokenErrorCallback = reject;

    try {
      if (!tokenClient) {
        tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.appdata',
          callback: (response: any) => {
            if (response.error) {
              tokenErrorCallback?.(response);
            } else if (response.access_token) {
              tokenCallback?.(response.access_token);
            } else {
              tokenErrorCallback?.(new Error('No access token returned.'));
            }
          },
        });
      }

      tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Searches for 'pate-salud-config.json' inside the appDataFolder.
 * Returns the file ID if found, otherwise null.
 */
export async function findConfigInAppData(accessToken: string): Promise<string | null> {
  const query = "name = 'pate-salud-config.json' and trashed = false";
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id,name)`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Error searching app config in appDataFolder: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Reads and parses the pate-salud-config.json file.
 */
export async function readConfigFromAppData(accessToken: string, fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Error reading config from appDataFolder: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Writes or updates the pate-salud-config.json inside the appDataFolder.
 * If fileId is passed, updates the file content. Otherwise creates it.
 */
export async function writeConfigToAppData(
  accessToken: string,
  config: any,
  fileId?: string | null
): Promise<string> {
  const boundary = 'pate_salud_appdata_boundary';
  const configString = JSON.stringify(config, null, 2);

  if (fileId) {
    // Update existing file content using PATCH upload type media
    const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: configString,
    });

    if (!res.ok) {
      throw new Error(`Error updating config in appDataFolder: ${res.statusText}`);
    }

    const data = await res.json();
    return data.id || fileId;
  } else {
    // Create new file inside appDataFolder using multipart
    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const metadata = {
      name: 'pate-salud-config.json',
      parents: ['appDataFolder'],
    };

    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const bodyParts = [
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n',
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      configString,
      '\r\n',
      closeDelimiter
    ];

    const bodyBlob = new Blob(bodyParts);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBlob,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Error creating config in appDataFolder: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.id;
  }
}
