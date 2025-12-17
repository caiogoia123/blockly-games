/**
 * @license
 * Copyright 2025 Google LLC // Adapte a data e detentor se necessário
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Helper functions for generating Python for blocks.
 * @author Seu Nome ou Apelido (adaptado de fraser@google.com (Neil Fraser))
 */
'use strict';

goog.provide('Blockly.Python');

goog.require('Blockly.Generator');
goog.require('Blockly.utils.object');
goog.require('Blockly.utils.string');
goog.require('Blockly.inputTypes'); // Necessário para scrub_


/**
 * Python code generator.
 * @type {!Blockly.Generator}
 */
Blockly.Python = new Blockly.Generator('Python');

/**
 * List of illegal variable names.
 * This is not intended to be a security feature. Blockly is 100% client-side,
 * so bypassing this list is trivial. This is intended to prevent users from
 * accidentally clobbering a built-in object or function.
 * Python Keywords: https://docs.python.org/3/reference/lexical_analysis.html#keywords
 * Python Builtins: https://docs.python.org/3/library/functions.html
 */
Blockly.Python.addReservedWords(
    'False,None,True,and,as,assert,async,await,break,class,continue,def,del,elif,else,except,finally,for,from,global,if,import,in,is,lambda,nonlocal,not,or,pass,raise,return,try,while,with,yield,' + // Keywords
    'ArithmeticError,AssertionError,AttributeError,BaseException,BlockingIOError,BrokenPipeError,BufferError,BytesWarning,ChildProcessError,ConnectionAbortedError,ConnectionError,ConnectionRefusedError,ConnectionResetError,DeprecationWarning,EOFError,Ellipsis,EnvironmentError,Exception,FileExistsError,FileNotFoundError,FloatingPointError,FutureWarning,GeneratorExit,IOError,ImportError,ImportWarning,IndentationError,IndexError,InterruptedError,IsADirectoryError,KeyError,KeyboardInterrupt,LookupError,MemoryError,ModuleNotFoundError,NameError,NotADirectoryError,NotImplemented,NotImplementedError,OSError,OverflowError,PendingDeprecationWarning,PermissionError,ProcessLookupError,RecursionError,ReferenceError,ResourceWarning,RuntimeError,RuntimeWarning,StandardError,StopAsyncIteration,StopIteration,SyntaxError,SyntaxWarning,SystemError,SystemExit,TabError,TimeoutError,TypeError,UnboundLocalError,UnicodeDecodeError,UnicodeEncodeError,UnicodeError,UnicodeTranslateError,UnicodeWarning,UserWarning,ValueError,Warning,ZeroDivisionError,' + // Exceptions
    '_,__build_class__,__debug__,__doc__,__import__,__loader__,__name__,__package__,__spec__,' + // Built-in constants
    'abs,all,any,ascii,bin,bool,breakpoint,bytearray,bytes,callable,chr,classmethod,compile,complex,delattr,dict,dir,divmod,enumerate,eval,exec,filter,float,format,frozenset,getattr,globals,hasattr,hash,help,hex,id,input,int,isinstance,issubclass,iter,len,list,locals,map,max,memoryview,min,next,object,oct,open,ord,pow,print,property,range,repr,reversed,round,set,setattr,slice,sorted,staticmethod,str,sum,super,tuple,type,vars,zip' // Built-in functions
);

/**
 * Order of operation ENUMs.
 * https://docs.python.org/3/reference/expressions.html#operator-precedence
 */
Blockly.Python.ORDER_ATOMIC = 0;             // 0 "" ...
Blockly.Python.ORDER_COLLECTION = 1;         // tuples, lists, dictionaries
Blockly.Python.ORDER_STRING_CONVERSION = 1;  // `expression...`
Blockly.Python.ORDER_MEMBER = 2.1;           // . []
Blockly.Python.ORDER_FUNCTION_CALL = 2.2;    // ()
Blockly.Python.ORDER_EXPONENTIATION = 3;     // **
Blockly.Python.ORDER_UNARY_SIGN = 4;         // + -
Blockly.Python.ORDER_BITWISE_NOT = 4;        // ~
Blockly.Python.ORDER_MULTIPLICATIVE = 5;     // * / // %
Blockly.Python.ORDER_ADDITIVE = 6;           // + -
Blockly.Python.ORDER_BITWISE_SHIFT = 7;      // << >>
Blockly.Python.ORDER_BITWISE_AND = 8;        // &
Blockly.Python.ORDER_BITWISE_XOR = 9;        // ^
Blockly.Python.ORDER_BITWISE_OR = 10;        // |
Blockly.Python.ORDER_RELATIONAL = 11;        // in, not in, is, is not, <, <=, >, >=, !=, ==
Blockly.Python.ORDER_LOGICAL_NOT = 12;       // not
Blockly.Python.ORDER_LOGICAL_AND = 13;       // and
Blockly.Python.ORDER_LOGICAL_OR = 14;        // or
Blockly.Python.ORDER_CONDITIONAL = 15;       // if else
Blockly.Python.ORDER_LAMBDA = 16;            // lambda
Blockly.Python.ORDER_NONE = 99;              // (...)

/**
 * List of outer-inner pairings that do NOT require parentheses.
 * Tried to be conservative and use the same as JS for simplicity. Adjustments
 * may be required based on Python's specific precedence rules.
 * @type {!Array<!Array<number>>}
 */
Blockly.Python.ORDER_OVERRIDES = [
  // (foo()).bar -> foo().bar
  // (foo())[0] -> foo()[0]
  [Blockly.Python.ORDER_FUNCTION_CALL, Blockly.Python.ORDER_MEMBER],
  // (foo())() -> foo()()
  [Blockly.Python.ORDER_FUNCTION_CALL, Blockly.Python.ORDER_FUNCTION_CALL],
  // (foo.bar).baz -> foo.bar.baz
  // (foo.bar)[0] -> foo.bar[0]
  // (foo[0]).bar -> foo[0].bar
  // (foo[0])[1] -> foo[0][1]
  [Blockly.Python.ORDER_MEMBER, Blockly.Python.ORDER_MEMBER],
  // (foo.bar)() -> foo.bar()
  // (foo[0])() -> foo[0]()
  [Blockly.Python.ORDER_MEMBER, Blockly.Python.ORDER_FUNCTION_CALL],

  // not not foo -> not not foo
  [Blockly.Python.ORDER_LOGICAL_NOT, Blockly.Python.ORDER_LOGICAL_NOT],
  // a and (b and c) -> a and b and c
  [Blockly.Python.ORDER_LOGICAL_AND, Blockly.Python.ORDER_LOGICAL_AND],
  // a or (b or c) -> a or b or c
  [Blockly.Python.ORDER_LOGICAL_OR, Blockly.Python.ORDER_LOGICAL_OR]
  // Omitting others from JS example as Python's precedence is different
];

/**
 * A statement terminator safe for use in multiline strings.
 * @type {string}
 */
Blockly.Python.STATEMENT_SUFFIX = ''; // Python doesn't use semicolons

/**
 * Character used for comment marks.
 * @type {string}
 */
Blockly.Python.COMMENT_PREFIX = '# ';

/**
 * Used to indent statements in loops and functions.
 */
Blockly.Python.INDENT = '  '; // Usually 4 spaces, but blockly-games seems to use 2

/**
 * The end-of-statement string, if any.
 * @type {?string}
 */
Blockly.Python.finish = function(code) {
  // Convert the definitions dictionary into a list.
  var definitions = Blockly.utils.object.values(this.definitions_);
  // Call Blockly.Generator's finish.
  code = Object.getPrototypeOf(this).finish.call(this, code);
  this.isInitialized = false;

  this.nameDB_.reset();

  // Prepend definitions to code.
  var imports = [];
  var functions = [];
  for (var i = 0; i < definitions.length; i++) {
    var def = definitions[i];
    if (def.match(/^(from\s+\S+\s+)?import\s+\S+/)) {
      imports.push(def);
    } else {
      functions.push(def);
    }
  }
  // Sort imports alphabetically.
  imports.sort();
  var allDefs = imports.join('\n') + '\n\n' + functions.join('\n\n');
  return allDefs.replace(/\n\n+/g, '\n\n').replace(/\n*$/, '\n\n\n') + code;
};

/**
 * Initialise the database of variable names.
 * @param {!Blockly.Workspace} workspace Workspace to generate code from.
 */
Blockly.Python.init = function(workspace) {
  /** @private */
  this.PASS = this.INDENT + 'pass\n'; // Define PASS statement specific to Python

  // Call Blockly.Generator's init.
  Object.getPrototypeOf(this).init.call(this);

  if (!this.nameDB_) {
    this.nameDB_ = new Blockly.Names(this.RESERVED_WORDS_);
  } else {
    this.nameDB_.reset();
  }

  this.nameDB_.setVariableMap(workspace.getVariableMap());
  this.nameDB_.populateVariables(workspace);
  this.nameDB_.populateProcedures(workspace);

  // Initialize definitions dictionary.
  this.definitions_ = Object.create(null);

  var defvars = [];
  // Add developer variables (not created or named by the user).
  var devVarList = Blockly.Variables.allDeveloperVariables(workspace);
  for (var i = 0; i < devVarList.length; i++) {
    defvars.push(this.nameDB_.getName(devVarList[i],
        Blockly.Names.DEVELOPER_VARIABLE_TYPE) + ' = None');
  }

  // Add user variables, but only ones that are being used.
  var variables = Blockly.Variables.allUsedVarModels(workspace);
  for (var i = 0; i < variables.length; i++) {
    defvars.push(this.nameDB_.getName(variables[i].getId(),
        Blockly.VARIABLE_CATEGORY_NAME) + ' = None');
  }

  // Declare all of the variables in definitions_ for use in finish.
  if (defvars.length) {
      // Python doesn't need 'var', but initializing to None can be useful
      // We will put this in definitions_, not directly in the code.
      this.definitions_['variables'] = defvars.join('\n');
  }
  this.isInitialized = true;
};

/**
 * Naked values are top-level blocks with outputs that aren't plugged into
 * anything. A trailing newline is needed to make the statement legal.
 * @param {string} line Line of generated code.
 * @return {string} Legal line of code.
 */
Blockly.Python.scrubNakedValue = function(line) {
  return line + '\n';
};

/**
 * Encode a string as a properly escaped Python string, complete with quotes.
 * @param {string} string Text to encode.
 * @return {string} Python string.
 * @protected
 */
Blockly.Python.quote_ = function(string) {
  // Can't use goog.string.quote since Python requires escaping of single quotes
  // if using single quotes and escaping of double quotes if using double quotes.
  string = string.replace(/\\/g, '\\\\')
                 .replace(/\n/g, '\\\n');

  // Decide which quote characters to use based on which ones appear in the string.
  var quote = '\'';
  if (string.indexOf('\'') !== -1) {
    if (string.indexOf('"') === -1) {
      quote = '"';
    } else {
      // String contains both single and double quotes, escape the single ones.
      string = string.replace(/'/g, '\\\'');
    }
  }
  return quote + string + quote;
};

/**
 * Encode a string as a properly escaped multiline Python string, complete
 * with quotes. Use triple quotes if the string contains quotes.
 * @param {string} string Text to encode.
 * @return {string} Python string.
 * @protected
 */
Blockly.Python.multiline_quote_ = function(string) {
  // Older versions might not support f-strings or easy multiline formatting.
  // Let's stick to the method seen in compressed code for compatibility.
  var lines = string.split(/\n/g).map(this.quote_);
  // Join with '+' and '\\n'
  return lines.join(' + \'\\n\' + \\\n' + this.INDENT); // Add indent for readability
};

/**
 * Common tasks for generating Python from blocks.
 * Handles comments for the specified block and any connected value blocks.
 * Calls any statements following this block.
 * @param {!Blockly.Block} block The current block.
 * @param {string} code The Python code created for this block.
 * @param {boolean=} opt_thisOnly True to generate code for only this statement.
 * @return {string} Python code with comments and subsequent blocks added.
 * @protected
 */
Blockly.Python.scrub_ = function(block, code, opt_thisOnly) {
  var commentCode = '';
  // Only collect comments for blocks that aren't inline.
  if (!block.outputConnection || !block.outputConnection.targetConnection) {
    // Collect comment for this block.
    var comment = block.getCommentText();
    if (comment) {
      comment = Blockly.utils.string.wrap(comment, this.COMMENT_WRAP - 3);
      commentCode += this.prefixLines(comment + '\n', this.COMMENT_PREFIX);
    }
    // Collect comments for all value arguments.
    // Don't collect comments for nested statements.
    for (var i = 0; i < block.inputList.length; i++) {
      if (block.inputList[i].type == Blockly.inputTypes.VALUE) {
        var childBlock = block.inputList[i].connection.targetBlock();
        if (childBlock) {
          comment = this.allNestedComments(childBlock);
          if (comment) {
            commentCode += this.prefixLines(comment, this.COMMENT_PREFIX);
          }
        }
      }
    }
  }
  var nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  var nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock);
  return commentCode + code + nextCode;
};

/**
 * Gets a property and adjusts the value while taking into account indexing.
 * This is based on the logic found in the compressed code.
 * @param {!Blockly.Block} block The block.
 * @param {string} atId The property ID of the element to get.
 * @param {number=} opt_delta Value to add.
 * @param {boolean=} opt_negate Whether to negate the value.
 * @param {number=} opt_order The highest order acting on this value.
 * @return {string|number}
 */
Blockly.Python.getAdjustedInt = function(block, atId, opt_delta, opt_negate) {
    var delta = opt_delta || 0;
    if (block.workspace.options.oneBasedIndex) {
      delta--; // Adjust delta for 1-based indexing if enabled
    }
    var defaultAtIndex = block.workspace.options.oneBasedIndex ? '1' : '0';

    if (delta) {
        // Use additive precedence if delta is non-zero
        var at = this.valueToCode(block, atId, this.ORDER_ADDITIVE) || defaultAtIndex;
    } else {
        // Use default precedence otherwise
        var at = this.valueToCode(block, atId, this.ORDER_NONE) || defaultAtIndex;
    }

    if (Blockly.isNumber(at)) {
      // If the index is a naked number, adjust it right now.
      at = parseInt(at, 10) + delta;
      if (opt_negate) {
        at = -at;
      }
    } else {
      // If the index is dynamic, adjust it in code.
      if (delta > 0) {
        at = 'int(' + at + ' + ' + delta + ')';
      } else if (delta < 0) {
        at = 'int(' + at + ' - ' + -delta + ')';
      } else {
        at = 'int(' + at + ')';
      }
      if (opt_negate) {
        at = '-' + at;
      }
    }
    return at;
  };

// Expose the generator singleton.
Blockly.Python = Blockly.Python;