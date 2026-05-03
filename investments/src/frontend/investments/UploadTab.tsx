import { useState, useEffect } from 'react';
import { Card, Group, Stack, Text, Button, Select, FileButton, Alert } from '@mantine/core';
import { BROKERS } from './utils';
import { api } from './api';

export function UploadTab() {
  const [files, setFiles] = useState<Record<string, string[]>>({});
  const [broker, setBroker] = useState<string>('swedbank');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadFiles = () => {
    api.listFiles().then(setFiles).catch(() => {});
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleUpload = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setMessage(null);
    try {
      const result = await api.uploadFiles(broker, selectedFiles);
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Uploaded ${result.uploaded?.length ?? 0} file(s). Portfolio will rebuild on next load.`,
        });
        loadFiles();
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
      const result = await api.deleteFile(brokerKey, filename);
      if (result.success) {
        setMessage({ type: 'success', text: `Deleted ${filename}.` });
        loadFiles();
      } else {
        setMessage({ type: 'error', text: result.error || 'Delete failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const totalFiles = Object.values(files).reduce((s, f) => s + f.length, 0);

  return (
    <Stack gap="md">
      {message && (
        <Alert
          color={message.type === 'success' ? 'green' : 'red'}
          withCloseButton
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">Upload broker files</Text>
        <Group>
          <Select
            data={BROKERS}
            value={broker}
            onChange={(v) => v && setBroker(v)}
            size="xs"
            style={{ width: 220 }}
          />
          <FileButton onChange={handleUpload} accept=".csv,.txt" multiple>
            {(props) => (
              <Button {...props} size="xs" loading={uploading}>
                Choose files
              </Button>
            )}
          </FileButton>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Select a broker, then choose CSV/TXT files. Files are parsed on every portfolio refresh.
          Re-uploads with overlapping date ranges are deduplicated automatically.
        </Text>
      </Card>

      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">Stored files ({totalFiles})</Text>
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
