import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(process.env.SN_REPO || '../stacker.news');
const deps = path.resolve('.');
const req = createRequire(path.join(deps, 'package.json'));
const out = path.resolve('screenshots');
fs.mkdirSync(out, { recursive: true });
const mocks = {
  'next/router': `export const useRouter = () => ({ reload: () => { window.__reloads = (window.__reloads || 0) + 1 }, asPath: '/fixture' })`,
  'next/link': `export default function Link({href, children, ...props}) { return <a href={typeof href === 'string' ? href : href.pathname} {...props}>{children}</a> }`,
  'react-bootstrap/Image': `export default function Image(props) { return <img {...props}/> }`,
  '@apollo/client/react': `export const useQuery = (_, {variables}) => ({data:{user:window.__users.find(u => u.id === variables.id)}})`,
  '@/fragments/users': 'export const USER = {}',
  '@/components/territory-branding': 'export const useBranding = () => null',
  '@/lib/format': 'export const ceilBigInt = (v) => BigInt(v); export const abbrNum = v => String(v); export const numWithUnits = v => String(v)',
  './more-footer': 'export default () => null',
  './use-data': 'export const useData = x => x',
  './badge': 'export default () => null',
  './me': 'export const useMe = () => ({me:null})',
  '@/components/user-header': 'export const NymActionDropdown = () => null',
  'classnames': 'export default (...args) => args.filter(Boolean).join(" ")',
  'next/dist/server/base-http/node': 'export class NodeNextRequest {}',
  'next-auth/jwt': 'export const encode = () => { throw Error("Unexpected JWT call in component fixture") }; export const decode = encode'
};
const entry = `import {Buffer} from 'buffer/'; import React from 'react'; import {createRoot} from 'react-dom/client'; import SwitchAccountList from '@/components/account'; import {CookiesProvider} from '@/components/use-cookie'; window.Buffer=Buffer; createRoot(document.getElementById('root')).render(<CookiesProvider ssrPublicCookies={window.__cookies}><SwitchAccountList/></CookiesProvider>)`;
await build({
  stdin: { contents: entry, loader: 'jsx', resolveDir: root }, bundle: true,
  outdir: out, entryNames: 'fixture', platform: 'browser', jsx: 'automatic',
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_URL': '"http://127.0.0.1"', 'process.env.MEDIA_URL_DOCKER': '""', 'process.env.NEXT_PUBLIC_MEDIA_URL': '"/media"', 'process.env.NEXT_PUBLIC_MEDIA_DOMAIN': '"127.0.0.1"' },
  loader: { '.js': 'jsx', '.css': 'local-css', '.woff2': 'file', '.woff': 'file' },
  plugins: [{ name: 'component-fixture-boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'fixture-mock' };
      if (args.importer.endsWith('constants.js') && args.path === './format') return { path: '@/lib/format', namespace: 'fixture-mock' };
      if (/^(react(?:-dom)?(?:\/.*)?|cookie|buffer\/)$/u.test(args.path)) return { path: req.resolve(args.path) };
      if (args.path.endsWith('.svg')) return { path: path.resolve(root, args.path.replace(/^@\//u, '')), namespace: 'fixture-svg' };
      if (args.path.startsWith('@/')) {
        let file = path.resolve(root, args.path.slice(2));
        if (!path.extname(file)) file += '.js';
        return { path: file };
      }
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture-mock' }, a => ({ contents: mocks[a.path], loader: 'jsx', resolveDir: root }));
    b.onLoad({ filter: /.*/, namespace: 'fixture-svg' }, a => {
      const svg = fs.readFileSync(a.path, 'utf8');
      const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
      return { contents: `export default props => <svg viewBox="0 0 24 24" {...props} dangerouslySetInnerHTML={{__html:${JSON.stringify(inner)}}}/>`, loader: 'jsx', resolveDir: root };
    });
  } }]
});

const users = [{ id: 27, name: 'anon' }, { id: 1001, name: 'first_account' }, { id: 1002, name: 'second_account' }];
const accountList = Buffer.from(JSON.stringify(users.slice(1))).toString('base64');
const html = theme => `<!doctype html><html data-bs-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bootstrap.css"><link rel="stylesheet" href="/fixture.css"><style>body{padding:24px;background:var(--bs-body-bg);color:var(--bs-body-color)}main{max-width:480px;margin:24px auto;border:1px solid var(--bs-border-color);border-radius:8px;padding:24px}.fill-primary{fill:#f5a623}</style></head><body><main id="root"></main><script>window.__users=${JSON.stringify(users)};window.__cookies={'multi_auth':${JSON.stringify(accountList)},'multi_auth.user-id':'1001'};</script><script src="/fixture.js"></script></body></html>`;
const server = http.createServer((r, s) => {
  const url = new URL(r.url, 'http://127.0.0.1');
  const resources = {
    '/fixture.js': [path.join(out, 'fixture.js'), 'text/javascript'],
    '/fixture.css': [path.join(out, 'fixture.css'), 'text/css'],
    '/bootstrap.css': [path.join(deps, 'node_modules/bootstrap/dist/css/bootstrap.min.css'), 'text/css'],
    '/dorian400.jpg': [path.join(root, 'public/dorian400.jpg'), 'image/jpeg']
  };
  if (resources[url.pathname]) { const [p, type] = resources[url.pathname]; s.setHeader('Content-Type', type); s.end(fs.readFileSync(p)); }
  else if (url.pathname === '/fixture') { s.setHeader('Content-Type', 'text/html'); s.end(html(url.searchParams.get('theme') === 'dark' ? 'dark' : 'light')); }
  else { s.statusCode = 404; s.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ channel: process.env.QA_BROWSER_CHANNEL || undefined, headless: true });
  for (const theme of ['light', 'dark']) for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    await context.addCookies([{ name: 'multi_auth', value: accountList, url: origin }, { name: 'multi_auth.user-id', value: '1001', url: origin }]);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/fixture?theme=' + theme);
    await page.getByText('To add another account, switch to').waitFor({ timeout: 5000 }).catch(e => { console.error(JSON.stringify({ theme, width, errors })); throw e; });
    assert.equal(await page.getByRole('link', { name: 'existing account', exact: true }).count(), 0);
    assert.equal(await page.locator('a[href*="multiAuth"]').count(), 0);
    assert(await page.getByText('then log in or sign up.').isVisible());
    assert(await page.getByRole('link', { name: '@first_account', exact: true }).isVisible());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${theme}/${width} overflows`);
    await page.screenshot({ path: path.join(out, `${theme}-${width}.png`) });
    await page.getByRole('link', { name: '@anon', exact: true }).click();
    assert.equal((await context.cookies()).find(x => x.name === 'multi_auth.user-id')?.value, 'anonymous');
    assert.equal(await page.evaluate(() => window.__reloads), 1);
    await page.getByRole('link', { name: '@second_account', exact: true }).click();
    assert.equal((await context.cookies()).find(x => x.name === 'multi_auth.user-id')?.value, '1002');
    assert.equal(await page.evaluate(() => window.__reloads), 2);
    assert.equal(await page.evaluate(() => location.pathname), '/fixture');
    assert.deepEqual(errors, []);
    results.push({ theme, width, instructionsVisible: true, oldLinkAbsent: true, overflow, anonCookie: 'anonymous', existingAccountCookie: '1002', reloadCalls: 2, errors });
    await context.close();
  }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ at: new Date().toISOString(), componentSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'components/account.js'))).digest('hex'), reactVersion: req('react/package.json').version, results, scope: 'Actual account.js, UserListRow, useCookie, lib/auth cookieOptions and styles in an isolated React browser fixture. Router reload, GraphQL responses, next/link, Image and unrelated component dependencies mocked. No full Next.js app, live account authentication, provider login, backend, payment or mobile device was tested.' }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: results.length, output: out, scope: 'isolated component browser fixture; mocked router and network, no full auth integration' }));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
