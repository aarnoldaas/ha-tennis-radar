import { useState, useEffect } from 'react';
import { Card, Group, Stack, Text, Button, Select, FileButton, Alert } from '@mantine/core';
import { BASE, BROKERS } from './utils';

export function UploadTab({ onDataChange }: { onDataChange: () => void }) {
  const [files, setFiles] = useState<Record<string, string[]>>({});
  const [broker, setBroker] = useState<string>('swedbank');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadFiles = () => {
    fetch(`${BASE}/api/investments/files`)
      .then(r => r.json())
      .then(setFiles)
      .catch(() => {});
  };

  useEffect(() => { loadFiles(); }, []);

  const handleUpload = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append(broker, file, file.name);
      }
      const res = await fetch(`${BASE}/api/investments/upload`, { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: `Uploaded ${result.uploaded.length} file(s). Data reloaded.` });
        loadFiles();
        onDataChange();
      } else {
        setMessage({ type: 'error', text: result.error || 'Upload failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (brokerKey: string, filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      const res = await fetch(`${BASE}/api/investments/files/${brokerKey}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: `Deleted ${filename}. Data reloaded.` });
        loadFiles();
        onDataChange();
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const totalFiles = Object.values(files).reduce((s, f) => s + f.length, 0);

  return (
    <Stack gap="md">
      {message && (
        <Alert color={message.type === 'success' ? 'green' : 'red'} withCloseButton onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">Upload Files</Text>
        <Group>
          <Select
            data={BROKERS}
            value={broker}
            onChange={(v) => v && setBroker(v)}
            size="xs"
            style={{ width: 200 }}
          />
          <FileButton onChange={handleUpload} accept=".csv,.txt" multiple>
            {(props) => (
              <Button {...props} size="xs" loading={uploading}>
                Choose Files
              </Button>
            )}
          </FileButton>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Select a broker, then choose CSV/TXT files to upload.
        </Text>
      </Card>

      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">Uploaded Files ({totalFiles})</Text>
        {BROKERS.map(b => {
          const brokerFiles = files[b.value] || [];
          if (brokerFiles.length === 0) return null;
          return (
            <div key={b.value}>
              <Text size="xs" fw={600} c="dimmed" mt="sm" mb="xs">{b.label}</Text>
              {brokerFiles.map(f => (
                <Group key={f} justify="space-between" py={2}>
                  <Text size="sm">{f}</Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => handleDelete(b.value, f)}
                  >
                    Delete
                  </Button>
                </Group>
              ))}
            </div>
          );
        })}
        {totalFiles === 0 && (
          <Text size="sm" c="dimmed">No files uploaded yet.</Text>
        )}
      </Card>
    </Stack>
  );
}
