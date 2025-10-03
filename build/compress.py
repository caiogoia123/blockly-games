#!/usr/bin/python
# Compresses the files for one game into a single JavaScript file.
#
# Copyright 2013 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json
import os
import re
import subprocess
import sys

if sys.version_info[0] < 3:
    raise Exception("Must be using Python 3")

WARNING = '// Automatically generated file.  Do not edit!\n'

blocklyMessageNames = []
blocklyGamesMessageNames = []

def main(gameName):
    print('Compressing %s' % gameName.title())
    if not os.path.exists(f'appengine/{gameName}/generated'):
        os.mkdir(f'appengine/{gameName}/generated')
    generate_uncompressed(gameName)
    generate_compressed(gameName)
    filterMessages(gameName)

    # Extract the list of supported languages from boot.js.
    with open('appengine/common/boot.js', 'r', encoding='utf-8') as boot:
        js = ' '.join(boot.readlines())
    m = re.search(r"\['BlocklyGamesLanguages'\] = (\[[-,'\s\w]+\])", js)
    if not m:
        raise Exception("Can't find BlocklyGamesLanguages in boot.js")
    langs = json.loads(m.group(1).replace("'", '"'))

    for lang in langs:
        language(gameName, lang)
    print("")


def filterMessages(gameName):
    global blocklyMessageNames, blocklyGamesMessageNames
    with open(f'appengine/{gameName}/generated/compressed.js', 'r', encoding='utf-8') as f:
        js = f.read()
    msgs = getMessages('en')
    for msg in msgs:
        m = re.search(r'BlocklyMsg\["([^"]+)"\] = ', msg)
        if m and (f'"{m.group(1)}"' in js or f'.{m.group(1)}' in js or f'%{{BKY_{m.group(1)}}}' in js):
            blocklyMessageNames.append(m.group(1))
        m = re.search(r'BlocklyGamesMsg\["([^"]+)"\] = ', msg)
        if m and (f'"{m.group(1)}"' in js or f'.{m.group(1)}' in js):
            blocklyGamesMessageNames.append(m.group(1))
    print(f"Found {len(blocklyMessageNames)} Blockly messages.")
    blocklyMessageNames.sort()
    print(f"Found {len(blocklyGamesMessageNames)} Blockly Games messages.")
    blocklyGamesMessageNames.sort()


def getMessages(lang):
    with open(f'appengine/generated/msg/{lang}.js', 'r', encoding='utf-8') as f:
        msgs = f.readlines()
    return msgs


def language(gameName, lang):
    global blocklyMessageNames, blocklyGamesMessageNames
    msgs = getMessages(lang)
    bMsgs = []
    bgMsgs = []
    for msg in msgs:
        m = re.search(r'BlocklyMsg\["([^"]+)"\] = (.*);\s*', msg)
        if m and m.group(1) in blocklyMessageNames:
            bMsgs.append(f'{m.group(1)}:{m.group(2)}')
        m = re.search(r'BlocklyGamesMsg\["([^"]+)"\] = (.*);\s*', msg)
        if m and m.group(1) in blocklyGamesMessageNames:
            bgMsgs.append(f'"{m.group(1)}":{m.group(2)}')

    msg_dir = f'appengine/{gameName}/generated/msg'
    if not os.path.exists(msg_dir):
        os.mkdir(msg_dir)
    with open(f'{msg_dir}/{lang}.js', 'w', encoding='utf-8') as f:
        f.write(WARNING)
        if bMsgs:
            f.write(f'var BlocklyMsg={{ {",".join(bMsgs)} }}\n')
        if bgMsgs:
            f.write(f'var BlocklyGamesMsg={{ {",".join(bgMsgs)} }}\n')


def generate_uncompressed(gameName):
    python_cmd = sys.executable
    closurebuilder_path = 'third-party/closurebuilder/closurebuilder.py'
    cmd = [python_cmd, closurebuilder_path,
           '--root=appengine/third-party/',
           '--root=appengine/generated/',
           '--root=appengine/src/',
           '--exclude=',
           '--namespace=%s' % gameName.replace("/", ".").title()]

    directory = gameName
    while directory:
        subdir = 'appengine/%s/generated/' % directory
        if os.path.isdir(subdir):
            cmd.append('--root=%s' % subdir)
        subdir = 'appengine/%s/src/' % directory
        if os.path.isdir(subdir):
            cmd.append('--root=%s' % subdir)
        directory, sep, fragment = directory.rpartition(os.path.sep)

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    except:
        raise Exception("Failed to Popen: %s" % ' '.join(cmd))
    files = readStdout(proc)

    # Bloco para injetar o gerador Python de forma inteligente
    if gameName == 'maze':
        print('Injecting Python generator for uncompressed mode...')
        try:
            # Encontra o gerador de JavaScript para injetar o de Python logo depois.
            js_generator_file = 'appengine/third-party/blockly/generators/javascript.js\n'
            index = files.index(js_generator_file)

            py_generator_file = 'appengine/third-party/blockly/generators/python_compressed.js\n'
            files.insert(index + 1, py_generator_file)
            print('Python generator injected successfully after JavaScript generator.')
        except ValueError:
            print('WARNING: Could not find JavaScript generator to inject Python generator after.')

    path = '../' if gameName == 'pond/docs' else ''
    prefix = 'appengine/'
    srcs = []
    for file in files:
        file = file.strip().replace('\\', '/')  # normaliza barras
        if file.startswith(prefix):
            file = file[len(prefix):]
        else:
            raise Exception('"%s" is not in "%s".' % (file, prefix))
        srcs.append('"%s%s"' % (path, file))

    # Usa string normal, não f-string, para evitar erros com '\'
    content = WARNING + """
window.CLOSURE_NO_DEPS = true;

(function() {
  var srcs = [
      %s
  ];
  function loadScript() {
    var src = srcs.shift();
    if (src) {
      var script = document.createElement('script');
      script.src = src;
      script.type = 'text/javascript';
      script.onload = loadScript;
      document.head.appendChild(script);
    }
  }
  loadScript();
})();
""" % ',\\n          '.join(srcs)

    with open('appengine/%s/generated/uncompressed.js' % gameName, 'w', encoding='utf-8') as f:
        f.write(content)

    print('Found %d dependencies.' % len(srcs))



def generate_compressed(gameName):
    cmd = [
        'java',
        '-jar', 'build/third-party-downloads/closure-compiler.jar',
        '--generate_exports',
        '--compilation_level', 'ADVANCED_OPTIMIZATIONS',
        '--dependency_mode=PRUNE',
        '--externs', 'externs/interpreter-externs.js',
        '--externs', 'externs/prettify-externs.js',
        '--externs', 'externs/soundJS-externs.js',
        '--externs', 'externs/storage-externs.js',
        '--externs', 'externs/svg-externs.js',
        '--language_out', 'ECMASCRIPT5',
        f'--entry_point=appengine/{gameName}/src/main',
        '--js=appengine/third-party/base.js',
        '--js=appengine/third-party/blockly/**.js',
        '--js=appengine/src/*.js',
        '--warning_level', 'QUIET',
    ]
    directory = gameName
    while directory:
        cmd.append(f'--js=appengine/{directory}/src/*.js')
        directory, sep, fragment = directory.rpartition(os.path.sep)

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    except:
        print(f"Failed to Popen: {cmd}")
        raise

    script = ''.join(readStdout(proc))
    script = trim_licence(script)
    print(f'Compressed to {len(script) / 1024:.2f} KB.')

    with open(f'appengine/{gameName}/generated/compressed.js', 'w', encoding='utf-8') as f:
        f.write(WARNING)
        f.write(script)


def trim_licence(code):
    apache2 = re.compile(r"""/\*

 (Copyright \d+ (Google LLC|Massachusetts Institute of Technology))
( All rights reserved.
)? SPDX-License-Identifier: Apache-2.0
\*/""")
    return re.sub(apache2, '', code)


def readStdout(proc):
    data = proc.stdout.readlines()
    return [line if isinstance(line, str) else line.decode('utf-8') for line in data]


if __name__ == '__main__':
    if len(sys.argv) == 2:
        main(sys.argv[1])
    else:
        print('Format: %s <appname>' % sys.argv[0])
        sys.exit(2)
