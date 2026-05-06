# Montreal Forced Aligner POC

Цель POC: проверить, что из пары `audio.mp3` + `text.txt` можно получить
таймкоды и затем собрать `.srt` без использования `aeneas`.

Этот вариант использует Montreal Forced Aligner, дальше `MFA`. MFA делает
forced alignment: берет уже известный текст и подгоняет его к аудио. Это лучше,
чем speech-to-text, если нам нужно сохранить именно исходный текст.

## Что проверяем

POC считается успешным, если утилита:

1. Принимает `mp3` и `txt`.
2. Готовит временный MFA corpus.
3. Запускает `mfa validate`.
4. Запускает `mfa align`.
5. Получает `TextGrid` с word-level таймкодами.
6. Конвертирует `TextGrid` в `SRT`.
7. Возвращает путь к готовому `.srt`.

## Почему MFA

Плюсы:

- активно поддерживается;
- есть готовые acoustic/dictionary models;
- подходит именно для задачи `known transcript + audio`;
- выдает word/phone alignment в `TextGrid`;
- не требует GPU.

Минусы:

- требует conda/mamba окружение;
- возвращает `TextGrid`, не `SRT`, поэтому нужен слой конвертации;
- длинные аудиофайлы лучше предварительно сегментировать;
- качество зависит от точности текста и словаря.

## Установка для POC

Официально MFA рекомендует conda/mamba, потому что Kaldi и зависимости ставятся
через conda-forge.

```sh
conda activate base
conda install -c conda-forge mamba
mamba create -n aligner -c conda-forge montreal-forced-aligner
conda activate aligner
mfa version
```

Скачать английскую acoustic model и dictionary:

```sh
mfa model download acoustic english_us_arpa
mfa model download dictionary english_us_arpa
mfa model inspect acoustic english_us_arpa
```

Если нужен не английский, надо выбрать matching acoustic model + dictionary для
целевого языка.

## Входные данные

Для POC берем:

```text
input/
  chapter001.mp3
  chapter001.txt
```

Требования:

- `chapter001.txt` должен содержать то, что реально произносится в аудио;
- имя файла без расширения должно совпадать;
- для первого POC лучше взять короткий фрагмент 30-120 секунд;
- текст лучше очистить от лишней разметки, номеров страниц, markdown, headers;
- один диктор и чистый звук сильно повышают шанс успешного результата.

MFA умеет читать matching `.txt`, если нет `.lab`, но для утилиты лучше явно
создавать `.lab`: это обычный текстовый файл с транскриптом.

## Рабочая директория POC

Утилита должна создать временную директорию:

```text
/tmp/mfa-sync-<job-id>/
  corpus/
    speaker1/
      chapter001.wav
      chapter001.lab
  aligned/
  output/
    chapter001.srt
```

Почему `speaker1`: MFA по умолчанию ожидает, что corpus может быть разложен по
speaker-директориям. Для POC можно считать, что весь файл произносит один
диктор.

## Подготовка аудио

Даже если MFA может обрабатывать разные форматы через `sox`/`ffmpeg`, для POC
лучше явно нормализовать MP3 в WAV:

```sh
ffmpeg -y \
  -i input/chapter001.mp3 \
  -ac 1 \
  -ar 16000 \
  -sample_fmt s16 \
  /tmp/mfa-sync-001/corpus/speaker1/chapter001.wav
```

Причины:

- Kaldi ожидает WAV;
- 16 kHz mono достаточно для speech alignment;
- 16-bit PCM снижает риск ошибок формата;
- поведение будет одинаковым локально, в CI и в контейнере.

Подготовить transcript:

```sh
cp input/chapter001.txt /tmp/mfa-sync-001/corpus/speaker1/chapter001.lab
```

## Проверка корпуса

Перед alignment обязательно запускать validate:

```sh
mfa validate \
  /tmp/mfa-sync-001/corpus \
  english_us_arpa \
  --acoustic_model_path english_us_arpa \
  --clean
```

Что смотреть в результате:

- количество файлов совпадает с ожиданием;
- нет критичных ошибок чтения audio/text;
- OOV words не слишком много;
- feature generation проходит успешно.

Если много OOV, MFA может плохо выровнять текст. Для POC это сигнал, что нужно
либо чистить текст, либо генерировать/расширять dictionary.

## Запуск alignment

```sh
mfa align \
  /tmp/mfa-sync-001/corpus \
  english_us_arpa \
  english_us_arpa \
  /tmp/mfa-sync-001/aligned \
  --clean
```

Ожидаемый результат:

```text
/tmp/mfa-sync-001/aligned/speaker1/chapter001.TextGrid
```

`TextGrid` будет содержать tiers для words и phones.

## Конвертация TextGrid в SRT

MFA не генерирует SRT напрямую. Нужен маленький конвертер:

```text
TextGrid words tier + исходный transcript -> subtitle cues -> SRT
```

Минимальная логика для POC:

1. Прочитать `TextGrid`.
2. Взять tier со словами, обычно `words`.
3. Выкинуть пустые интервалы.
4. Сопоставить MFA-normalized words обратно с токенами исходного transcript,
   чтобы сохранить регистр, пунктуацию и окончания предложений.
5. Сгруппировать слова в subtitle cues:
   - максимум 6-10 слов на cue;
   - максимум 2 строки;
   - максимум 3-5 секунд на cue;
   - начинать новый cue на большой паузе, например `> 0.6s`.
   - по возможности завершать cue на конце предложения.
6. Записать `.srt`.

Пример итогового SRT:

```srt
1
00:00:00,240 --> 00:00:02,910
This is the first subtitle line.

2
00:00:03,420 --> 00:00:06,120
This is the next subtitle line.
```

Для Python-конвертера можно использовать библиотеку `praatio`, потому что она
умеет читать Praat TextGrid. Но для POC допустимо начать с простого парсера,
если формат output стабилен.

## CLI утилиты для POC

Предлагаемый интерфейс:

```sh
sync-subtitles-mfa \
  --audio input/chapter001.mp3 \
  --text input/chapter001.txt \
  --language english_us_arpa \
  --out output/chapter001.srt \
  --keep-workdir
```

Минимальные флаги:

- `--audio`: путь к `.mp3`, `.wav`, `.m4a`;
- `--text`: путь к transcript `.txt`;
- `--out`: путь к `.srt`;
- `--language`: имя модели MFA, по умолчанию `english_us_arpa`;
- `--keep-workdir`: не удалять temp directory для debugging;
- `--max-words-per-cue`: по умолчанию `14`;
- `--max-cue-duration`: по умолчанию `6.0`;
- `--max-line-chars`: по умолчанию `72`;
- `--pause-threshold`: по умолчанию `0.6`.
- `--sentence-mode`: `balanced` по умолчанию; `strict` держит cue до конца
  предложения, где это возможно.
- `--skip-validate`: пропустить `mfa validate` и сразу запускать `mfa align`.
  Полезно для Docker на Apple Silicon, где amd64 emulation делает validation
  слишком медленным.

## Реализация в этом репозитории

POC реализован как Python CLI без runtime-зависимостей:

```text
src/sync_subtitles_mfa/
  cli.py       # orchestration: ffmpeg -> mfa validate -> mfa align -> SRT
  textgrid.py  # parser for long and short Praat TextGrid words tiers
  transcript.py # maps aligned words back to source transcript punctuation/case
  srt.py       # subtitle cue grouping and SRT writer
tests/
  test_textgrid.py
  test_srt.py
```

Запуск из checkout без установки пакета:

```sh
PYTHONPATH=src python3 -m sync_subtitles_mfa \
  --audio test/chapter009.mp3 \
  --text test/chapter009.txt \
  --out output/chapter009.srt \
  --language english_us_arpa \
  --keep-workdir
```

Если нужно ориентироваться строго на предложения:

```sh
PYTHONPATH=src python3 -m sync_subtitles_mfa \
  --audio test/chapter009.mp3 \
  --text test/chapter009.txt \
  --out output/chapter009.srt \
  --sentence-mode strict \
  --max-line-chars 95
```

Для русского языка нужно скачать matching MFA acoustic model + dictionary:

```sh
MFA_ROOT_DIR=.mfa .mamba/envs/aligner/bin/mfa model download acoustic russian_mfa
MFA_ROOT_DIR=.mfa .mamba/envs/aligner/bin/mfa model download dictionary russian_mfa
```

После этого запуск отличается только моделью:

```sh
PYTHONPATH=src python3 -m sync_subtitles_mfa \
  --audio input/chapter001.mp3 \
  --text input/chapter001.txt \
  --out output/chapter001.srt \
  --language russian_mfa \
  --sentence-mode strict \
  --max-line-chars 95
```

## Docker

Чтобы не настраивать MFA, conda/mamba и модели на каждой машине вручную, можно
собрать Docker image:

```sh
docker build --platform linux/amd64 -t sync-subtitles-mfa:local .
```

Image включает:

- Python 3.11;
- Montreal Forced Aligner;
- `english_us_arpa` acoustic + dictionary;
- `russian_mfa` acoustic + dictionary;
- локальный patch для MFA validation logging bug в `russian_mfa`.

`linux/amd64` указан намеренно: на Apple Silicon Docker по умолчанию собирает
`linux/arm64`, а для этой платформы в conda-forge не хватает MFA dependency
`baumwelch`.

Запуск английского примера:

```sh
mkdir -p output && chmod 777 output

docker run --rm \
  -v "$PWD:/data" \
  sync-subtitles-mfa:local \
  --audio test/chapter009.mp3 \
  --text test/chapter009.txt \
  --out output/chapter009.srt \
  --language english_us_arpa \
  --sentence-mode strict \
  --max-line-chars 95
```

Запуск русского примера:

```sh
mkdir -p output && chmod 777 output

docker run --rm \
  -v "$PWD:/data" \
  sync-subtitles-mfa:local \
  --audio test/chapter005.v1.mp3 \
  --text test/chapter005.v1.txt \
  --out output/chapter005.v1.srt \
  --language russian_mfa \
  --skip-validate \
  --sentence-mode strict \
  --max-line-chars 95
```

То же через Docker Compose:

```sh
docker compose run --rm sync-subtitles \
  --audio test/chapter005.v1.mp3 \
  --text test/chapter005.v1.txt \
  --out output/chapter005.v1.srt \
  --language russian_mfa \
  --sentence-mode strict \
  --max-line-chars 95
```

После установки пакета команда доступна как:

```sh
sync-subtitles-mfa \
  --audio test/chapter009.mp3 \
  --text test/chapter009.txt \
  --out output/chapter009.srt
```

Локальные unit tests, не требующие `mfa`:

```sh
PYTHONPATH=src python3 -m unittest discover -s tests
```

Полный end-to-end запуск требует, чтобы `ffmpeg` и `mfa` были доступны в
`PATH`, а модели `english_us_arpa` были предварительно скачаны через MFA.

В текущем checkout MFA установлен локально через standalone `micromamba`:

```text
.tools/bin/micromamba
.mamba/envs/aligner/
.mfa/
```

CLI автоматически добавляет `.mamba/envs/aligner/bin` в `PATH` для дочерних
процессов и выставляет `MFA_ROOT_DIR=.mfa`, поэтому активировать conda/mamba
окружение вручную не нужно.

## Псевдокод

```text
main(audio, text, out):
  job_dir = create_temp_dir()
  corpus_dir = job_dir / "corpus" / "speaker1"
  aligned_dir = job_dir / "aligned"

  basename = stem(audio)

  run ffmpeg:
    audio -> corpus_dir / basename.wav

  normalize transcript:
    text -> corpus_dir / basename.lab

  run:
    mfa validate corpus_dir.parent english_us_arpa english_us_arpa --clean

  run:
    mfa align corpus_dir.parent english_us_arpa english_us_arpa aligned_dir --clean

  textgrid = aligned_dir / "speaker1" / (basename + ".TextGrid")

  words = read_words_tier(textgrid)
  cues = group_words_into_subtitles(words)
  write_srt(cues, out)

  return out
```

## Ошибки, которые надо обработать

Утилита должна возвращать понятные ошибки:

- `ffmpeg` не установлен;
- `mfa` не установлен или не активирован conda env;
- модель не скачана;
- audio не читается;
- transcript пустой;
- `mfa validate` нашел OOV/format проблемы;
- `mfa align` не создал `TextGrid`;
- `TextGrid` не содержит words tier;
- итоговый SRT пустой.

## Ограничения POC

Для первого POC не надо решать все сразу:

- не делаем speaker diarization;
- не поддерживаем много языков одновременно;
- не адаптируем acoustic model;
- не обрабатываем многочасовые audiobook файлы без сегментации;
- не пытаемся автоматически исправлять transcript.

Если POC пройдет, следующий шаг - добавить segmentation:

```text
long mp3 + full text
  -> split audio by silence/chapters
  -> split text на соответствующие куски
  -> align каждый chunk
  -> merge SRT with time offsets
```

## Критерии успеха

POC можно считать рабочим, если на коротком тестовом MP3:

- `mfa validate` проходит без fatal errors;
- `mfa align` создает `TextGrid`;
- generated SRT открывается в VLC/IINA/mpv;
- первые 5-10 subtitles примерно совпадают с речью;
- drift к концу тестового файла меньше 500-1000 ms.

## Источники

- MFA installation docs:
  https://montreal-forced-aligner.readthedocs.io/en/stable/installation.html
- MFA first steps:
  https://montreal-forced-aligner.readthedocs.io/en/v3.3.7/first_steps/index.html
- MFA corpus structure:
  https://montreal-forced-aligner.readthedocs.io/en/v3.3.3/user_guide/corpus_structure.html
- MFA models:
  https://montreal-forced-aligner.readthedocs.io/en/v3.3.2/user_guide/models/index.html
