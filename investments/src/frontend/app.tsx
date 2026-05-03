import { createRoot } from 'react-dom/client';
import {
  MantineProvider,
  createTheme,
  Container,
  Title,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';

import { UploadTab } from './investments/UploadTab';

const theme = createTheme({
  primaryColor: 'yellow',
  defaultRadius: 'md',
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  headings: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: '700',
  },
  colors: {
    yellow: [
      '#fff9e6', '#fff0bf', '#ffe699', '#ffd966', '#ffcc33',
      '#f5a623', '#d48c1a', '#a87216', '#7a5310', '#4d340a',
    ],
  },
  other: {
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  },
});

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" py="md">
        <Title order={3} mb="md">Investments</Title>
        <UploadTab />
      </Container>
    </MantineProvider>
  );
}

function mount() {
  const root = document.getElementById('app');
  if (root) {
    createRoot(root).render(<App />);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      createRoot(document.getElementById('app')!).render(<App />);
    });
  }
}
mount();
