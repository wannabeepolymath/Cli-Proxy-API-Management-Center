import { describe, expect, test } from 'bun:test';
import { maskEmailsInText } from '@/features/quota/emailMask';

describe('maskEmailsInText', () => {
  test('masks local part and first domain segment, keeps provider prefix and suffixes', () => {
    expect(maskEmailsInText('claude-test@proud.gg.json')).toBe('claude-t•••@p•••.gg.json');
    expect(maskEmailsInText('claude-theo@1somewhere.dev.json')).toBe('claude-t•••@1•••.dev.json');
  });

  test('keeps multi-token filename prefixes intact', () => {
    expect(maskEmailsInText('codex-ae5d455f-theo@t3.gg-pro.json')).toBe(
      'codex-ae5d455f-t•••@t•••.gg-pro.json'
    );
  });

  test('masks a bare email', () => {
    expect(maskEmailsInText('user@example.com')).toBe('u•••@e•••.com');
  });

  test('leaves text without an email untouched', () => {
    expect(maskEmailsInText('vertex-service-account.json')).toBe('vertex-service-account.json');
    expect(maskEmailsInText('')).toBe('');
  });

  test('masks every email in a combined display label', () => {
    expect(maskEmailsInText('devin.json · person@corp.io')).toBe('devin.json · p•••@c•••.io');
  });
});
