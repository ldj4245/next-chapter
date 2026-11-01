import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const loginSource = await readFile(new URL('../src/components/login.tsx', import.meta.url), 'utf8');
const returnSource = await readFile(new URL('../src/lib/auth-return.ts', import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const returnModule = { exports: {} };
vm.runInNewContext(compile(returnSource), { exports: returnModule.exports, module: returnModule });

// Execute the shipped form's submit handler without a browser or a router.
function formHarness({ mode = 'login', returnTo = '/', respond = async () => ({ signedIn: true }) } = {}) {
  const slots = [], navigations = [], requests = [];
  let cursor = 0, failure;
  const action = { busy: false, error: '', async run(callback) {
    action.busy = true;
    try { await callback(); } catch (error) { failure = error; action.error = error.message; }
    finally { action.busy = false; }
  } };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState(initial) {
        const key = cursor++;
        if (!(key in slots)) slots[key] = initial;
        return [slots[key], value => { slots[key] = value; }];
      },
      useRef: () => ({ current: null }), useEffect: () => {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/link': { default: 'link' },
    'lucide-react': { Eye: 'eye', EyeOff: 'eye-off' },
    '@/lib/auth-input': { parseSignup: () => {}, MIN_PASSWORD_LENGTH: 10, MAX_PASSWORD_LENGTH: 128 },
    '@/lib/domain': { InputError: class InputError extends Error {} },
    './api-client': {
      useAction: () => action, RequestError: class RequestError extends Error {},
      request: async (path, method, input) => { requests.push({ path, method, input }); return respond(); },
    },
    './ui': { ErrorMessage: 'error' }, './auth-layout': { AuthLayout: 'layout' },
    '@/lib/auth-return': returnModule.exports,
  };
  const formModule = { exports: {} };
  vm.runInNewContext(compile(loginSource), {
    exports: formModule.exports, module: formModule, URL,
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key]; } },
    window: { location: { origin: 'https://app.example', replace: href => navigations.push(href) } },
    require(name) {
      assert.ok(name in dependencies, 'Unexpected dependency: ' + name);
      return dependencies[name];
    },
  });
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    const children = node.props?.children;
    return (Array.isArray(children) ? children : [children]).map(child => find(child, type)).find(Boolean);
  };
  const render = () => { cursor = 0; return formModule.exports.AuthForm({ ready: true, mode, returnTo }); };
  const submit = () => find(render(), 'form').props.onSubmit({
    preventDefault() {}, currentTarget: { email: 'reader@example.com', password: 'example-password', password_confirm: 'example-password' },
  });
  return { submit, render, find, navigations, requests, get failure() { return failure; } };
}

test('로그인 응답을 기다린 후 새 문서로 이동하고 중복 제출을 막음', async () => {
  let finish;
  const harness = formHarness({ respond: () => new Promise(resolve => { finish = resolve; }) });
  const submitting = harness.submit();
  assert.equal(harness.navigations.length, 0);
  finish({ signedIn: true });
  await submitting;
  assert.deepEqual(harness.navigations, ['https://app.example/']);
  const button = harness.find(harness.render(), 'form').props.children.at(-1);
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.children, '이동 중…');
  await harness.submit();
  assert.equal(harness.requests.length, 1);
});

test('로그인과 즉시 로그인 회원가입은 안전한 목적지만 새로 열음', async () => {
  const invite = '/connect?token=' + 'a'.repeat(64);
  for (const mode of ['login', 'signup']) {
    for (const [returnTo, destination] of [
      ['/', '/'], ['/admin', '/admin'], ['/admin/audit', '/admin/audit'], [invite, invite],
      ['https://outside.example', '/'], ['//outside.example', '/'], ['javascript:alert(1)', '/'],
    ]) {
      const harness = formHarness({ mode, returnTo });
      await harness.submit();
      assert.deepEqual(harness.navigations, ['https://app.example' + destination]);
      assert.equal(harness.requests[0].path, '/api/auth/' + mode);
    }
  }
});

test('인증 메일 대기는 이동하지 않으며 실패한 로그인은 재시도 가능', async () => {
  const waiting = formHarness({ mode: 'signup', respond: async () => ({ signedIn: false, confirmationRequired: true }) });
  await waiting.submit();
  assert.equal(waiting.navigations.length, 0);
  assert.equal(waiting.find(waiting.render(), 'form'), undefined);
  let attempts = 0;
  const failure = formHarness({ respond: async () => {
    if (!attempts++) throw new Error('Login failed');
    return { signedIn: true };
  } });
  await failure.submit();
  assert.equal(failure.navigations.length, 0);
  assert.equal(failure.failure.message, 'Login failed');
  await failure.submit();
  assert.deepEqual(failure.navigations, ['https://app.example/']);
  const missingSession = formHarness({ respond: async () => ({ signedIn: false }) });
  await missingSession.submit();
  assert.equal(missingSession.navigations.length, 0);
  assert.ok(missingSession.failure);
});
