# Storage

Volcano Storage provides secure file storage with access control. Upload user avatars, documents, media files, and more with built-in security policies.

## Overview

The storage module offers:

- **File Operations** - Upload, download, list, delete, move, and copy files
- **Access Control** - Private by default, with per-file public/private settings
- **Resumable Uploads** - Handle large files reliably with chunked uploads
- **Bucket Organization** - Organize files into logical buckets

## Basic Concepts

### Buckets

Files are organized into buckets. A bucket is a top-level container, similar to a folder or an S3 bucket. You might have buckets like:

- `avatars` - User profile pictures
- `documents` - PDF reports and files
- `uploads` - General user uploads

Buckets are created in the Volcano dashboard and referenced by name in the SDK.

### Paths

Within a bucket, files are identified by their path. Paths can include subdirectories:

```
avatars/user-123/profile.jpg
documents/reports/2024/q1-summary.pdf
uploads/images/photo-001.png
```

### Access Control

Files are **private by default**. Private files require authentication to download. You can make individual files public, allowing anyone to access them via a public URL.

## Selecting a Bucket

All storage operations start by selecting a bucket:

```javascript
const avatars = volcano.storage.from('avatars');
const documents = volcano.storage.from('documents');
```

This returns a `StorageFileApi` object with methods for file operations.

## Uploading Files

### Basic Upload

Upload a file from an `<input type="file">` element:

```javascript
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const { data, error } = await volcano.storage.from('avatars').upload('user-123/profile.jpg', file);

if (error) {
  console.error('Upload failed:', error.message);
  return;
}

console.log('Uploaded:', data.name);
console.log('Size:', data.size, 'bytes');
console.log('Type:', data.mime_type);
```

### Upload with Options

Specify content type:

```javascript
const { data, error } = await volcano.storage
  .from('documents')
  .upload('reports/annual-2024.pdf', file, {
    contentType: 'application/pdf',
  });
```

### Upload from Blob or ArrayBuffer

You can upload any binary data:

```javascript
// From Blob
const blob = new Blob(['Hello, World!'], { type: 'text/plain' });
await volcano.storage.from('uploads').upload('notes/hello.txt', blob);

// From ArrayBuffer
const buffer = await fetchSomeData();
await volcano.storage.from('uploads').upload('data/export.bin', buffer, {
  contentType: 'application/octet-stream',
});
```

### Upload Path Patterns

Organize files with meaningful paths:

```javascript
// User-specific files
const userId = user.id;
await storage.upload(`${userId}/avatar.jpg`, file);
await storage.upload(`${userId}/documents/${docId}.pdf`, file);

// Date-organized files
const date = new Date().toISOString().split('T')[0];
await storage.upload(`uploads/${date}/${file.name}`, file);
```

## Downloading Files

### Basic Download

```javascript
const { data: blob, error } = await volcano.storage
  .from('documents')
  .download('reports/annual-2024.pdf');

if (error) {
  console.error('Download failed:', error.message);
  return;
}

// Create a download link
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'annual-2024.pdf';
a.click();

// Clean up
URL.revokeObjectURL(url);
```

### Display in Browser

For images and other displayable content:

```javascript
const { data: blob } = await volcano.storage.from('avatars').download('user-123/profile.jpg');

const url = URL.createObjectURL(blob);
document.getElementById('avatar').src = url;
```

### Partial Download (Range Requests)

Download only a portion of a file:

```javascript
// Download first 1KB
const { data: blob } = await volcano.storage.from('documents').download('large-file.zip', {
  range: 'bytes=0-1023',
});
```

This is useful for streaming media or resuming interrupted downloads.

## Listing Files

### List All Files in Bucket

```javascript
const { data: files, error } = await volcano.storage.from('uploads').list();

files.forEach((file) => {
  console.log(`${file.name} - ${file.size} bytes`);
});
```

### List with Prefix

Filter files by path prefix:

```javascript
// List files in a specific "folder"
const { data: files } = await volcano.storage.from('uploads').list('images/');

// List user's files
const { data: files } = await volcano.storage.from('documents').list(`${userId}/`);
```

### Paginated Listing

For buckets with many files:

```javascript
const { data: files, nextCursor } = await volcano.storage.from('uploads').list('', { limit: 100 });

console.log(`Found ${files.length} files`);

if (nextCursor) {
  // Fetch next page
  const { data: moreFiles } = await volcano.storage
    .from('uploads')
    .list('', { limit: 100, cursor: nextCursor });
}
```

### File Metadata

Listed files include metadata:

```javascript
const { data: files } = await volcano.storage.from('uploads').list();

files.forEach((file) => {
  console.log('Name:', file.name);
  console.log('Size:', file.size);
  console.log('Type:', file.mime_type);
  console.log('Public:', file.is_public);
  console.log('Created:', file.created_at);
  console.log('Owner:', file.owner_id);

  if (file.is_public && file.public_url) {
    console.log('Public URL:', file.public_url);
  }
});
```

## Deleting Files

### Delete Single File

```javascript
const { data, error } = await volcano.storage.from('uploads').remove('old-file.txt');

if (!error) {
  console.log('File deleted');
}
```

### Delete Multiple Files

```javascript
const { data, error } = await volcano.storage
  .from('uploads')
  .remove(['temp/file1.txt', 'temp/file2.txt', 'temp/file3.txt']);

if (data) {
  console.log(`Deleted ${data.deleted.length} files`);
}
```

## Moving and Copying Files

### Move (Rename)

```javascript
const { data, error } = await volcano.storage
  .from('documents')
  .move('drafts/report.pdf', 'published/report.pdf');

if (data) {
  console.log('File moved to:', data.name);
}
```

### Copy

```javascript
const { data, error } = await volcano.storage
  .from('documents')
  .copy('templates/invoice.pdf', 'invoices/2024-001.pdf');

if (data) {
  console.log('File copied to:', data.name);
}
```

## Public and Private Files

### Default: Private

Files are private by default. They require an authenticated user session to download.

### Make File Public

```javascript
const { data, error } = await volcano.storage
  .from('avatars')
  .updateVisibility('user-123/profile.jpg', true);

if (data) {
  console.log('File is now public');
  console.log('Public URL:', data.public_url);
}
```

### Make File Private

```javascript
const { error } = await volcano.storage
  .from('avatars')
  .updateVisibility('user-123/profile.jpg', false);

if (!error) {
  console.log('File is now private');
}
```

### Public URLs

Public files have a URL that anyone can access without authentication:

```javascript
// After making a file public
const { data } = await volcano.storage.from('avatars').updateVisibility('profile.jpg', true);

// Use the public URL
const publicUrl = data.public_url;
// https://api.yourproject.volcano.dev/public/project-id/avatars/profile.jpg

// Use in HTML
<img src={publicUrl} alt="Avatar" />;

// Share via email, embed in external sites, etc.
```

The public URL:

- Requires no authentication
- Works in any browser
- Can be cached by CDNs
- Returns 403 if the file is made private later

### Get Public URL

For files you know are public, get their URL directly:

```javascript
const { data, error } = volcano.storage.from('avatars').getPublicUrl('profile.jpg');

if (data) {
  console.log('Public URL:', data.publicUrl);
}
```

**Note:** This constructs the URL locally and doesn't verify the file is actually public. Use `list()` or `updateVisibility()` to get the server-confirmed URL.

## Resumable Uploads

For large files (over 100MB) or unreliable connections, use resumable uploads.

### Simple Resumable Upload

The `uploadResumable` method handles everything automatically:

```javascript
const { data, error } = await volcano.storage
  .from('uploads')
  .uploadResumable('large-video.mp4', file, {
    onProgress: (uploaded, total) => {
      const percent = Math.round((uploaded / total) * 100);
      console.log(`Progress: ${percent}%`);
    },
  });

if (data) {
  console.log('Upload complete:', data.name);
}
```

### Manual Resumable Upload

For more control, manage the upload session yourself:

```javascript
// 1. Create upload session
const { data: session } = await volcano.storage
  .from('uploads')
  .createUploadSession('large-video.mp4', {
    totalSize: file.size,
    contentType: 'video/mp4',
    partSize: 10 * 1024 * 1024, // 10MB parts
  });

console.log(`Session created: ${session.session_id}`);
console.log(`Will upload in ${session.total_parts} parts`);

// 2. Upload each part
for (let i = 1; i <= session.total_parts; i++) {
  const start = (i - 1) * session.part_size;
  const end = Math.min(start + session.part_size, file.size);
  const partData = file.slice(start, end);

  const { error } = await volcano.storage
    .from('uploads')
    .uploadPart('large-video.mp4', session.session_id, i, partData);

  if (error) {
    console.error(`Part ${i} failed:`, error.message);
    // Can retry this part later
    break;
  }

  console.log(`Part ${i}/${session.total_parts} uploaded`);
}

// 3. Complete the upload
const { data, error } = await volcano.storage
  .from('uploads')
  .completeUploadSession('large-video.mp4', session.session_id);

if (data) {
  console.log('Upload complete!', data.name);
}
```

### Resume Interrupted Upload

If an upload is interrupted, you can resume it later:

```javascript
// Check session status
const { data: status } = await volcano.storage
  .from('uploads')
  .getUploadSession('large-video.mp4', sessionId);

console.log(`${status.uploaded_parts}/${status.total_parts} parts uploaded`);
console.log(`${status.uploaded_bytes}/${status.total_size} bytes`);
console.log('Missing parts:', status.missing_parts);

// Upload only the missing parts
for (const partNumber of status.missing_parts) {
  const start = (partNumber - 1) * status.part_size;
  const end = Math.min(start + status.part_size, file.size);
  const partData = file.slice(start, end);

  await volcano.storage
    .from('uploads')
    .uploadPart('large-video.mp4', sessionId, partNumber, partData);
}

// Complete when all parts are uploaded
await volcano.storage.from('uploads').completeUploadSession('large-video.mp4', sessionId);
```

### Abort Upload

Cancel an in-progress upload and clean up:

```javascript
const { error } = await volcano.storage
  .from('uploads')
  .abortUploadSession('large-video.mp4', sessionId);

if (!error) {
  console.log('Upload cancelled');
}
```

### Resumable Upload Limits

- Minimum part size: 5 MB
- Maximum part size: 25 MB (default)
- Maximum parts: 10,000
- Session expiry: 7 days

## Error Handling

Storage operations return errors rather than throwing:

```javascript
const { data, error } = await volcano.storage.from('uploads').upload('file.txt', file);

if (error) {
  // Common errors:
  // - "No active session" - User not signed in
  // - "File not found" - File doesn't exist
  // - "Permission denied" - Access policy violation
  // - "Bucket not found" - Invalid bucket name
  // - "File too large" - Exceeds size limit

  console.error('Upload failed:', error.message);
}
```

## Access Policies

Storage access is controlled by policies defined in the Volcano dashboard. Typical patterns:

### User's Own Files

Users can only access files in their own "folder":

```javascript
// Policy: path starts with user's ID
await storage.upload(`${user.id}/avatar.jpg`, file); // Allowed
await storage.upload(`other-user-id/avatar.jpg`, file); // Denied
```

### Public Read, Authenticated Write

Anyone can download, but only authenticated users can upload:

```javascript
// Download works without auth (if file is public)
await storage.download('public/logo.png');

// Upload requires authentication
await storage.upload('public/new-file.png', file);
```

### Role-Based Access

Admins can access all files, regular users have restrictions:

```javascript
// Policy checks user's role from JWT
// Admin: full access
// User: only own files
```

## Best Practices

### Use Meaningful Paths

Organize files with structured paths:

```javascript
// Good
`users/${userId}/documents/${year}/${filename}``projects/${projectId}/assets/${assetType}/${filename}`
// Avoid
`file-${Date.now()}.pdf``${Math.random()}.jpg`;
```

### Validate Before Upload

Check file type and size client-side:

```javascript
function validateFile(file) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];

  if (file.size > maxSize) {
    return 'File too large (max 10MB)';
  }

  if (!allowedTypes.includes(file.type)) {
    return 'Invalid file type';
  }

  return null;
}

const error = validateFile(file);
if (error) {
  showError(error);
  return;
}

await storage.upload('images/photo.jpg', file);
```

### Handle Large Files

Use resumable uploads for files over 100MB:

```javascript
const useResumable = file.size > 100 * 1024 * 1024;

if (useResumable) {
  await storage.uploadResumable(path, file, { onProgress });
} else {
  await storage.upload(path, file);
}
```

### Clean Up Object URLs

When creating URLs from blobs, revoke them when done:

```javascript
const url = URL.createObjectURL(blob);
img.src = url;

// Later, when the image is no longer needed:
URL.revokeObjectURL(url);
```

### Show Upload Progress

For better UX with large files:

```javascript
await volcano.storage.from('uploads').uploadResumable('video.mp4', file, {
  onProgress: (uploaded, total) => {
    const percent = Math.round((uploaded / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
  },
});
```

## Next Steps

- [Database](./database.md) - Store file metadata in your database
- [Realtime](./realtime.md) - Get notified when files are uploaded
- [Functions](./functions.md) - Process files with serverless functions
