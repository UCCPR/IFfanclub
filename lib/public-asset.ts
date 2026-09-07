declare const __PUBLIC_ASSET_VERSIONS__: Readonly<Record<string, string>> | undefined;

const versions =
  typeof __PUBLIC_ASSET_VERSIONS__ === 'undefined'
    ? undefined
    : __PUBLIC_ASSET_VERSIONS__;

/** Return a deploy-stable URL. The query changes only when file bytes change. */
export function publicAssetUrl(path: string): string {
  const normalized = path.replace(/^\/+/, '');
  const base = (import.meta.env?.BASE_URL || './') + normalized;
  const version = versions?.[normalized];
  return version ? `${base}?v=${version}` : base;
}

export function registerAssetCache(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const base = import.meta.env.BASE_URL || './';
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(base + 'asset-cache-sw.js', {
      scope: base,
    });
  });
}
