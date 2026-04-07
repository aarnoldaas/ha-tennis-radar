import { useState, useEffect } from 'react';
import { Card, Group, Stack, Text, Button, Badge, Textarea, Alert, Center, Loader } from '@mantine/core';
import { BASE, timeAgo, renderMarkdown } from './utils';

export function PlanTab() {
  const [content, setContent] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refinedContent, setRefinedContent] = useState<string | null>(null);
  const [refinedAt, setRefinedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/investments/plan`)
      .then(r => r.json())
      .then(d => {
        setContent(d.content || '');
        setSavedAt(d.updatedAt || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/investments/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const result = await res.json();
      if (result.success) {
        setSavedAt(result.updatedAt);
        setDirty(false);
      } else {
        setError(result.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefine = async () => {
    if (!content.trim()) {
      setError('Write your plan first before refining it with AI.');
      return;
    }
    if (dirty) await handleSave();
    setRefining(true);
    setError(null);
    setRefinedContent(null);
    try {
      const res = await fetch(`${BASE}/api/investments/plan/refine`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setRefinedContent(result.content);
        setRefinedAt(result.refinedAt);
      } else {
        setError(result.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefining(false);
    }
  };

  const handleAcceptRefined = () => {
    if (refinedContent) {
      setContent(refinedContent);
      setDirty(true);
      setRefinedContent(null);
    }
  };

  if (loading) return <Center><Loader size="sm" /></Center>;

  return (
    <Stack gap="md">
      <Card padding="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Group gap="sm">
            <Text fw={600}>My Investment Plan</Text>
            {savedAt && <Text size="xs" c="dimmed">Saved: {timeAgo(savedAt)}</Text>}
            {dirty && <Badge size="xs" color="yellow" variant="light">unsaved</Badge>}
          </Group>
          <Group gap="xs">
            <Button
              variant="light"
              size="xs"
              loading={saving}
              onClick={handleSave}
              disabled={!dirty}
            >
              Save
            </Button>
            <Button
              variant="light"
              size="xs"
              color="violet"
              loading={refining}
              onClick={handleRefine}
            >
              Refine with AI
            </Button>
          </Group>
        </Group>

        <Textarea
          placeholder={`Write your investment plan here...\n\nExample:\n## Goals\n- Build a diversified portfolio targeting 8-10% annual returns\n- Increase dividend income to \u20AC200/month by 2027\n\n## Next Steps\n- DCA into VWCE \u20AC500/month\n- Reduce Baltic exposure from 40% to 25%\n- Research Nordic REITs for income\n\n## Rules\n- Never let a single position exceed 15%\n- Rebalance quarterly\n- Keep 6 months cash reserve`}
          value={content}
          onChange={(e) => { setContent(e.currentTarget.value); setDirty(true); }}
          minRows={15}
          autosize
          styles={{ input: { fontFamily: 'monospace', fontSize: 13 } }}
        />
      </Card>

      {error && (
        <Alert color="red" variant="light" title="Error">{error}</Alert>
      )}

      {refinedContent && (
        <Card padding="md" withBorder>
          <Group justify="space-between" mb="sm">
            <Group gap="sm">
              <Text fw={600} c="violet">AI-Refined Plan</Text>
              {refinedAt && <Text size="xs" c="dimmed">{timeAgo(refinedAt)}</Text>}
            </Group>
            <Group gap="xs">
              <Button size="xs" variant="light" color="violet" onClick={handleAcceptRefined}>
                Accept & Replace
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={() => setRefinedContent(null)}>
                Dismiss
              </Button>
            </Group>
          </Group>
          <Card padding="sm" withBorder style={{ background: 'var(--mantine-color-dark-7)' }}>
            <div
              className="ai-suggestions-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(refinedContent) }}
            />
          </Card>
        </Card>
      )}

      {content.trim() && !refinedContent && (
        <Card padding="md" withBorder>
          <Text fw={600} mb="sm">Preview</Text>
          <div
            className="ai-suggestions-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        </Card>
      )}
    </Stack>
  );
}
