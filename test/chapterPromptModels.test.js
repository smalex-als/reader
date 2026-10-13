import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';

test('new prompt models survive creation, editing, reload, and generation', async (t) => {
  // Use an isolated app tree so prompt edits never touch the real data library.
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-prompt-models-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
  await fs.cp(path.join(root, 'server'), path.join(sandbox, 'server'), { recursive: true });
  await fs.cp(path.join(root, 'shared'), path.join(sandbox, 'shared'), { recursive: true });
  await fs.writeFile(path.join(sandbox, 'package.json'), '{"type":"module"}');
  await fs.symlink(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'));
  const bookDirectory = path.join(sandbox, 'data', 'example');
  await fs.mkdir(bookDirectory, { recursive: true });
  await fs.writeFile(path.join(bookDirectory, 'book.json'), '{"type":"text"}');
  await fs.writeFile(path.join(bookDirectory, 'chapter001.txt'), 'Example chapter text.');

  const load = (file) => import(pathToFileURL(path.join(sandbox, file)).href);
  const {
    addPromptToLibrary, updatePromptInLibrary, listChapterTextPromptLibrary,
    createChapterTextVersion
  } = await load('server/lib/chapterTextVersions.js');
  const { getOpenAI } = await load('server/lib/openai.js');
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  const requests = [];
  t.mock.method(getOpenAI().chat.completions, 'create', async (request) => {
    requests.push(request);
    return (async function* () {
      yield { choices: [{ delta: { content: 'Rewritten chapter.' } }] };
    })();
  });

  const models = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'];
  for (const model of models) {
    const { prompt } = await addPromptToLibrary({
      name: `Test ${model}`, template: 'Rewrite {{chapter_text}}', model,
      reasoningEffort: 'medium'
    });
    assert.equal(prompt.model, model);
    const editedModel = models[(models.indexOf(model) + 1) % models.length];
    await updatePromptInLibrary({ ...prompt, promptId: prompt.id, model: editedModel });
    const reloaded = await listChapterTextPromptLibrary();
    assert.equal(reloaded.prompts.find((entry) => entry.id === prompt.id).model, editedModel);
    const persisted = JSON.parse(await fs.readFile(
      path.join(sandbox, 'data', '.chapter-text-prompts.json'), 'utf8'
    ));
    assert.equal(persisted.prompts.find((entry) => entry.id === prompt.id).model, editedModel);

    await createChapterTextVersion({ bookId: 'example', chapterNumber: 1, promptId: prompt.id });
    assert.equal(requests.at(-1).model, editedModel);
    assert.equal(requests.at(-1).reasoning_effort, 'medium');
    await createChapterTextVersion({ bookId: 'example', chapterNumber: 1, promptId: prompt.id, model });
    assert.equal(requests.at(-1).model, model);
  }
  const meta = JSON.parse(await fs.readFile(
    path.join(bookDirectory, 'chapter001.text-versions.json'), 'utf8'
  ));
  assert.deepEqual(meta.versions.map((version) => version.model), requests.map((request) => request.model));
});
