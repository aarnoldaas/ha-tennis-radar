import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  FileButton,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { api, type DataFileEntry } from './api';

const ROOT_DIR = '<root>';

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? ROOT_DIR : path.slice(0, idx);
}

function nameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

// Caches and the runtime instrument master are special — derived files
// regenerate themselves and the master is re-seeded from the bundled
// baseline on next boot, but warning the user up-front beats a confusing
// "where did my mappings go?" later.
const PROTECTED: Record<string, string> = {
  'instruments.yaml':
    'Runtime instrument master. Deleting it loses your custom Yahoo mappings; the next boot re-seeds the bundled baseline.',
  'fx-cache.json': 'ECB FX cache. Will be re-fetched on next refresh.',
  'price-cache.json':
    'Yahoo price cache. Will be re-fetched on next refresh.',
};

interface GroupedFiles {
  dir: string;
  files: DataFileEntry[];
}

function groupByDir(files: DataFileEntry[]): GroupedFiles[] {
  const map = new Map<string, DataFileEntry[]>();
  for (const f of files) {
    const d = dirOf(f.path);
    const arr = map.get(d) ?? [];
    arr.push(f);
    map.set(d, arr);
  }
  const dirs = Array.from(map.keys()).sort((a, b) => {
    if (a === ROOT_DIR) return -1;
    if (b === ROOT_DIR) return 1;
    return a.localeCompare(b);
  });
  return dirs.map(d => ({
    dir: d,
    files: (map.get(d) ?? []).sort((a, b) => a.path.localeCompare(b.path)),
  }));
}

export function FilesTab() {
  const [files, setFiles] = useState<DataFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<
    { type: 'success' | 'error'; text: string } | null
  >(null);
  const [uploadDir, setUploadDir] = useState<string>('');
  const [customDir, setCustomDir] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.listDataFiles();
      setFiles(payload.files);
    } catch (e: any) {
      setError(e?.message || 'Failed to list files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupByDir(files), [files]);

  const totalSize = useMemo(
    () => files.reduce((s, f) => s + f.size, 0),
    [files],
  );

  const knownDirs = useMemo(() => {
    const set = new Set<string>(['', 'Investments/swedbank', 'Investments/interactive-brokers']);
    for (const f of files) {
      const d = dirOf(f.path);
      if (d !== ROOT_DIR) set.add(d);
    }
    return Array.from(set).sort();
  }, [files]);

  const dirOptions = useMemo(
    () => [
      { value: '', label: '/ (root)' },
      ...knownDirs
        .filter(d => d !== '')
        .map(d => ({ value: d, label: d + '/' })),
      { value: '__custom__', label: 'Custom path…' },
    ],
    [knownDirs],
  );

  const effectiveUploadDir =
    uploadDir === '__custom__' ? customDir.trim().replace(/^\/+|\/+$/g, '') : uploadDir;

  const handleUpload = async (selected: File[]) => {
    if (selected.length === 0) return;
    setUploading(true);
    setMessage(null);
    try {
      const result = await api.uploadDataFiles(effectiveUploadDir, selected);
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Uploaded ${result.uploaded?.length ?? 0} file(s).`,
        });
        await load();
      } else {
        setMessage({ type: 'error', text: result.error || 'Upload failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (path: string) => {
    const warning = PROTECTED[nameOf(path)];
    const prompt = warning
      ? `Delete ${path}?\n\n${warning}`
      : `Delete ${path}?`;
    if (!confirm(prompt)) return;
    setMessage(null);
    try {
      const result = await api.deleteDataFile(path);
      if (result.success) {
        setMessage({ type: 'success', text: `Deleted ${path}.` });
        await load();
      } else {
        setMessage({ type: 'error', text: result.error || 'Delete failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Delete failed' });
    }
  };

  if (loading && files.length === 0) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

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

      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">
          Upload
        </Text>
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select
            label="Destination"
            data={dirOptions}
            value={uploadDir}
            onChange={v => setUploadDir(v ?? '')}
            size="xs"
            style={{ width: 260 }}
          />
          {uploadDir === '__custom__' && (
            <TextInput
              label="Custom path"
              placeholder="e.g. Investments/swedbank"
              value={customDir}
              onChange={e => setCustomDir(e.currentTarget.value)}
              size="xs"
              style={{ width: 260 }}
            />
          )}
          <FileButton onChange={handleUpload} multiple>
            {props => (
              <Button {...props} size="xs" loading={uploading}>
                Choose files
              </Button>
            )}
          </FileButton>
          <Button size="xs" variant="default" onClick={load} disabled={loading}>
            Reload
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Files upload directly to the chosen folder under <code>/data</code>. Subdirectories
          are created as needed.
        </Text>
      </Card>

      <Card padding="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600}>
            All files ({files.length})
          </Text>
          <Text size="xs" c="dimmed">
            Total {formatBytes(totalSize)}
          </Text>
        </Group>

        {files.length === 0 ? (
          <Text size="sm" c="dimmed">
            No files in /data yet.
          </Text>
        ) : (
          grouped.map(group => (
            <div key={group.dir} style={{ marginBottom: 16 }}>
              <Text
                size="xs"
                fw={600}
                c="dimmed"
                mt="sm"
                mb={4}
                style={{ fontFamily: 'var(--mantine-font-family-monospace, monospace)' }}
              >
                {group.dir === ROOT_DIR ? '/' : group.dir + '/'}
              </Text>
              <Table
                highlightOnHover
                withColumnBorders={false}
                horizontalSpacing="xs"
                verticalSpacing={6}
                style={{ tableLayout: 'fixed' }}
              >
                <Table.Tbody>
                  {group.files.map(f => {
                    const name = nameOf(f.path);
                    const protectedNote = PROTECTED[name];
                    return (
                      <Table.Tr key={f.path}>
                        <Table.Td style={{ wordBreak: 'break-all' }}>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" component="span">
                              {name}
                            </Text>
                            {protectedNote && (
                              <Badge color="yellow" variant="light" size="xs">
                                managed
                              </Badge>
                            )}
                          </Group>
                          {protectedNote && (
                            <Text size="xs" c="dimmed" mt={2}>
                              {protectedNote}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ width: 100, textAlign: 'right' }}>
                          <Text size="xs" c="dimmed">
                            {formatBytes(f.size)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ width: 180, textAlign: 'right' }}>
                          <Text size="xs" c="dimmed">
                            {formatTime(f.mtime)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ width: 160, textAlign: 'right' }}>
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Anchor
                              href={api.dataFileUrl(f.path)}
                              download={name}
                              size="xs"
                            >
                              Download
                            </Anchor>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              onClick={() => handleDelete(f.path)}
                            >
                              Delete
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </div>
          ))
        )}
      </Card>
    </Stack>
  );
}
