/**
 * Google Drive API Client Layer
 * Handles authentication requests, folder resolution, and file uploading using pure Fetch API
 * with minimum scopes (https://www.googleapis.com/auth/drive.file).
 */

let tokenClient: any = null;
let tokenCallback: ((token: string) => void) | null = null;
let tokenErrorCallback: ((err: any) => void) | null = null;

/**
 * Triggers the Google Identity Services popup to request drive.file permissions.
 * Keeps the token in memory and returns it via a Promise.
 */
export function requestDrivePermission(clientId: string): Promise<string> {
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
          scope: 'https://www.googleapis.com/auth/drive.file',
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
 * Searches for a folder by name under a given parent ID.
 * Returns the folder ID if found, otherwise null.
 */
async function findFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  let query = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Error searching folder ${name}: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Creates a folder under a parent ID.
 */
async function createFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const url = 'https://www.googleapis.com/drive/v3/files';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });

  if (!res.ok) {
    throw new Error(`Error creating folder ${name}: ${res.statusText}`);
  }

  const data = await res.json();
  return data.id;
}

export async function getOrCreateFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const existingId = await findFolder(accessToken, name, parentId);
  if (existingId) return existingId;
  return await createFolder(accessToken, name, parentId);
}

/**
 * Resolves the nested folder path:
 * `Paté Salud Familiar` -> memberName -> categoryName -> year
 * Returns the year folder ID where files will be uploaded.
 */
export async function resolveDrivePath(
  accessToken: string,
  memberName: string,
  categoryName: string,
  year: string
): Promise<string> {
  // 1. Root folder
  const rootId = await getOrCreateFolder(accessToken, 'Paté Salud Familiar');
  // 2. Member folder
  const memberId = await getOrCreateFolder(accessToken, memberName, rootId);
  // 3. Clinical Category folder
  const categoryId = await getOrCreateFolder(accessToken, categoryName, memberId);
  // 4. Year folder
  const yearId = await getOrCreateFolder(accessToken, year, categoryId);

  return yearId;
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink?: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
}

/**
 * Uploads a file to a specific folder on Google Drive.
 * Uses a multipart/related Fetch API call.
 */
export async function uploadFile(
  accessToken: string,
  file: File,
  parentFolderId: string
): Promise<DriveUploadResult> {
  const boundary = '314159265358979323846';
  const metadata = {
    name: file.name,
    parents: [parentFolderId],
  };

  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = new Blob([
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    '\r\n'
  ]);

  const mediaPart = new Blob([
    delimiter,
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    '\r\n'
  ]);

  const closingPart = new Blob([closeDelimiter]);
  const body = new Blob([metadataPart, mediaPart, closingPart]);

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,createdTime';

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`);
  }

  const data = await res.json();
  return {
    fileId: data.id,
    webViewLink: data.webViewLink,
    name: data.name,
    mimeType: data.mimeType,
    size: Number(data.size || file.size),
    createdTime: data.createdTime || new Date().toISOString(),
  };
}

/**
 * Shares a Google Drive file (or spreadsheet) with a specific user email as a reader (read-only).
 * Returns the permission ID.
 */
export async function shareFileWithUser(
  accessToken: string,
  fileId: string,
  email: string
): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'user',
      emailAddress: email,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to share file: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.id; // Returns permission ID
}

/**
 * Revokes a user's permission to access a Google Drive file.
 */
export async function revokeFileShare(
  accessToken: string,
  fileId: string,
  permissionId: string
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to revoke file share: ${err.error?.message || res.statusText}`);
  }
}

/**
 * Shares a Google Drive file or folder with a specific user email.
 * role can be 'writer' or 'reader'.
 * message is an optional message sent in the notification email.
 */
export async function shareFileOrFolderWithUser(
  accessToken: string,
  fileId: string,
  email: string,
  role: 'writer' | 'reader',
  message?: string
): Promise<string> {
  const sendEmail = !!message;
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=${sendEmail}`;
  const body: any = {
    role,
    type: 'user',
    emailAddress: email,
  };
  if (message) {
    body.emailMessage = message;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to share file or folder: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.id; // Returns permission ID
}

/**
 * Revokes a user's permission to access a Google Drive file or folder.
 */
export async function revokeFileOrFolderPermission(
  accessToken: string,
  fileId: string,
  permissionId: string
): Promise<void> {
  return revokeFileShare(accessToken, fileId, permissionId);
}

export interface DrivePermission {
  id: string;
  role: string;
  type: string;
  emailAddress?: string;
  displayName?: string;
}

/**
 * Lists permissions for a given file or folder.
 */
export async function listFilePermissions(
  accessToken: string,
  fileId: string
): Promise<DrivePermission[]> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,role,type,emailAddress,displayName)`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to list permissions: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.permissions || [];
}

export interface SharedFileInfo {
  id: string;
  name: string;
  owners?: {
    displayName?: string;
    emailAddress?: string;
  }[];
}

/**
 * Searches for operational spreadsheets shared with the current user.
 */
export async function searchSharedDatabases(
  accessToken: string
): Promise<SharedFileInfo[]> {
  const query = `name contains 'Paté Salud Familiar - Base Operacional' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,owners(displayName,emailAddress))`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to search shared databases: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

