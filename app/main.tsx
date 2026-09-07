import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './page';
import './globals.css';
import './gacha.css';
import './pool-authoritative.css';
import { registerAssetCache } from '@/lib/public-asset';

registerAssetCache();

const root = createRoot(document.getElementById('root')!);
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has('gacha-review')
) {
  void import('../dev/gacha-review').then(({ GachaReview }) =>
    root.render(<GachaReview />),
  );
} else {
  root.render(
    <StrictMode>
      <Home />
    </StrictMode>,
  );
}
