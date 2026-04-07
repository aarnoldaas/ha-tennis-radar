import { useState, useEffect } from 'react';
import { Card, Group, Stack, Text, Button, Alert, Center, Loader } from '@mantine/core';
import type { AiSuggestions } from './types';
import { BASE, timeAgo, renderMarkdown } from './utils';

export function AiInsightsTab() {
  const [suggestions, setSuggestions] = useState<AiSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/investments/ai-suggestions`)
      .then(r => r.json())
      .then(d => { setSuggestions(d.suggestions ? d : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/investments/ai-suggestions`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setSuggestions({ suggestions: result.suggestions, generatedAt: result.generatedAt });
      } else {
        setError(result.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Text fw={600}>AI Portfolio Insights</Text>
          {suggestions?.generatedAt && (
            <Text size="xs" c="dimmed">Last updated: {timeAgo(suggestions.generatedAt)}</Text>
          )}
        </Group>
        <Button
          variant="light"
          size="xs"
          color="violet"
          loading={generating}
          onClick={handleGenerate}
        >
          {suggestions ? 'Refresh Insights' : 'Generate Insights'}
        </Button>
      </Group>

      {error && (
        <Alert color="red" variant="light" title="Error">{error}</Alert>
      )}

      {loading && <Center><Loader size="sm" /></Center>}

      {!loading && !suggestions && !error && (
        <Alert color="blue" variant="light">
          Click "Generate Insights" to get AI-powered portfolio analysis and suggestions.
          Requires an Anthropic API key configured in the Tennis Radar Settings tab.
        </Alert>
      )}

      {suggestions?.suggestions && (
        <Card padding="md" withBorder>
          <div
            className="ai-suggestions-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(suggestions.suggestions) }}
          />
        </Card>
      )}
    </Stack>
  );
}
