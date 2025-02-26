/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSCodeContentManager } from 'sql/workbench/api/common/notebooks/vscodeSerializationProvider';
import type * as vscode from 'vscode';
import type * as azdata from 'azdata';
import * as sinon from 'sinon';
import { NotebookCellKind } from 'vs/workbench/api/common/extHostTypes';
import { VSBuffer } from 'vs/base/common/buffer';
import * as assert from 'assert';
import { OutputTypes } from 'sql/workbench/services/notebook/common/contracts';
import { NBFORMAT, NBFORMAT_MINOR } from 'sql/workbench/common/constants';
import { convertToVSCodeNotebookCell, convertToVSCodeCellOutput, convertToADSCellOutput, convertToInternalInteractiveKernelMetadata, addExternalInteractiveKernelMetadata } from 'sql/workbench/api/common/notebooks/notebookUtils';
import { VSCodeNotebookDocument } from 'sql/workbench/api/common/notebooks/vscodeNotebookDocument';
import { URI } from 'vs/base/common/uri';
import { VSCodeNotebookEditor } from 'sql/workbench/api/common/notebooks/vscodeNotebookEditor';

class MockNotebookSerializer implements vscode.NotebookSerializer {
	deserializeNotebook(content: Uint8Array, token: vscode.CancellationToken): vscode.NotebookData | Thenable<vscode.NotebookData> {
		return undefined;
	}
	serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Uint8Array | Thenable<Uint8Array> {
		return new Uint8Array([]);
	}
}

suite('Notebook Serializer', () => {
	let contentManager: VSCodeContentManager;
	let sandbox: sinon.SinonSandbox;
	let serializeSpy: sinon.SinonSpy;

	const deserializeResult: vscode.NotebookData = {
		cells: [{
			kind: NotebookCellKind.Code,
			value: '1+1',
			languageId: 'python',
			outputs: [{
				id: '1',
				items: [{
					mime: 'text/plain',
					data: VSBuffer.fromString('2').buffer
				}],
				metadata: {}
			}],
			executionSummary: {
				executionOrder: 1
			}
		}, {
			kind: NotebookCellKind.Code,
			value: 'print(1)',
			languageId: 'python',
			outputs: [{
				id: '2',
				items: [{
					mime: 'text/plain',
					data: VSBuffer.fromString('1').buffer
				}],
				metadata: {}
			}],
			executionSummary: {
				executionOrder: 2
			}
		}],
		metadata: {
			custom: {
				metadata: {
					kernelspec: {
						name: 'python3',
						display_name: 'Python 3',
						language: 'python'
					},
					language_info: {
						name: 'python',
						version: '3.8.10',
						mimetype: 'text/x-python',
						codemirror_mode: {
							name: 'ipython',
							version: '3'
						}
					}
				},
				nbformat: NBFORMAT,
				nbformat_minor: NBFORMAT_MINOR
			}
		},
	};

	const expectedDeserializedNotebook: azdata.nb.INotebookContents = {
		metadata: {
			kernelspec: {
				name: 'python3',
				display_name: 'Python 3',
				language: 'python'
			},
			language_info: {
				name: 'python',
				version: '3.8.10',
				mimetype: 'text/x-python',
				codemirror_mode: {
					name: 'ipython',
					version: '3'
				}
			}
		},
		nbformat: NBFORMAT,
		nbformat_minor: NBFORMAT_MINOR,
		cells: [
			{
				cell_type: 'code',
				source: '1+1',
				outputs: [
					{
						id: '1',
						output_type: 'execute_result',
						data: {
							'text/plain': '2'
						},
						metadata: {},
						execution_count: 1
					} as azdata.nb.IExecuteResult
				],
				execution_count: 1,
				metadata: {
					language: 'python'
				}
			},
			{
				cell_type: 'code',
				source: 'print(1)',
				outputs: [
					{
						id: '2',
						output_type: 'execute_result',
						data: {
							'text/plain': '1'
						},
						metadata: {},
						execution_count: 2
					} as azdata.nb.IExecuteResult
				],
				execution_count: 2,
				metadata: {
					language: 'python'
				}
			}
		]
	};

	const expectedSerializeArg: vscode.NotebookData = {
		cells: [{
			kind: NotebookCellKind.Code,
			value: '1+1',
			languageId: 'python',
			outputs: [{
				items: [{
					mime: 'text/plain',
					data: VSBuffer.fromString('2').buffer
				}],
				metadata: {},
				id: '1'
			}],
			executionSummary: {
				executionOrder: 1
			},
			metadata: {
				custom: {
					metadata: {
						language: 'python'
					}
				}
			}
		}, {
			kind: NotebookCellKind.Code,
			value: 'print(1)',
			languageId: 'python',
			outputs: [{
				items: [{
					mime: 'text/plain',
					data: VSBuffer.fromString('1').buffer
				}],
				metadata: {},
				id: '2'
			}],
			executionSummary: {
				executionOrder: 2
			},
			metadata: {
				custom: {
					metadata: {
						language: 'python'
					}
				}
			}
		}],
		metadata: {
			custom: {
				metadata: {
					kernelspec: {
						name: 'python3',
						display_name: 'Python 3',
						language: 'python'
					},
					language_info: {
						name: 'python',
						version: '3.8.10',
						mimetype: 'text/x-python',
						codemirror_mode: {
							name: 'ipython',
							version: '3'
						}
					}
				},
				nbformat: NBFORMAT,
				nbformat_minor: NBFORMAT_MINOR
			}
		}
	};

	setup(() => {
		sandbox = sinon.createSandbox();
		let serializer = new MockNotebookSerializer();
		sandbox.stub(serializer, 'deserializeNotebook').returns(deserializeResult);
		serializeSpy = sandbox.spy(serializer, 'serializeNotebook');

		contentManager = new VSCodeContentManager(serializer);
	});

	teardown(() => {
		sandbox.restore();
	});


	test('Convert VSCode notebook output to ADS notebook output', async () => {
		let cellOutput: vscode.NotebookCellOutput = {
			items: [{
				mime: 'text/plain',
				data: VSBuffer.fromString('2').buffer
			}, {
				mime: 'text/html',
				data: VSBuffer.fromString('<i>2</i>').buffer
			}],
			metadata: {},
			id: '1'
		};
		let expectedADSOutput: azdata.nb.IExecuteResult[] = [
			{
				id: '1',
				output_type: 'execute_result',
				data: {
					'text/plain': '2',
					'text/html': '<i>2</i>'
				},
				metadata: {},
				execution_count: 1
			}
		];

		let actualOutput = convertToADSCellOutput(cellOutput, 1);
		assert.deepStrictEqual(actualOutput, expectedADSOutput);
	});

	test('Convert ADS notebook execute result to VSCode notebook output', async () => {
		let cellOutput: azdata.nb.IExecuteResult = {
			id: 'testId',
			output_type: OutputTypes.ExecuteResult,
			data: {
				'text/plain': 'abc',
				'text/html': '<i>abc</i>'
			},
			execution_count: 1
		};
		let expectedVSCodeOutput: vscode.NotebookCellOutput = {
			items: [{
				mime: 'text/plain',
				data: VSBuffer.fromString('abc').buffer
			}, {
				mime: 'text/html',
				data: VSBuffer.fromString('<i>abc</i>').buffer
			}],
			id: 'testId',
			metadata: undefined
		};
		let actualOutput = convertToVSCodeCellOutput(cellOutput);
		assert.deepStrictEqual(actualOutput, expectedVSCodeOutput);
	});

	test('Convert ADS notebook stream result to VSCode notebook output', async () => {
		let cellOutput: azdata.nb.IStreamResult = {
			id: 'testId',
			output_type: 'stream',
			name: 'stdout',
			text: [
				'abc'
			]
		};
		let expectedVSCodeOutput: vscode.NotebookCellOutput = {
			items: [{
				mime: 'text/html',
				data: VSBuffer.fromString('abc').buffer
			}],
			id: 'testId',
			metadata: undefined
		};
		let actualOutput = convertToVSCodeCellOutput(cellOutput);
		assert.deepStrictEqual(actualOutput, expectedVSCodeOutput);
	});

	test('Convert ADS notebook error with trace to VSCode notebook output', async () => {
		let cellOutput: azdata.nb.IErrorResult = {
			id: 'testId',
			output_type: 'error',
			ename: 'TestException',
			evalue: 'Expected test error',
			traceback: ['Trace line 1', 'Trace line 2']
		};
		let expectedVSCodeOutput: vscode.NotebookCellOutput = {
			items: [{
				mime: 'text/html',
				data: VSBuffer.fromString('TestException: Expected test error\nTrace line 1\nTrace line 2').buffer
			}],
			id: 'testId',
			metadata: undefined
		};
		let actualOutput = convertToVSCodeCellOutput(cellOutput);
		assert.deepStrictEqual(actualOutput, expectedVSCodeOutput);
	});

	test('Convert ADS notebook error without trace to VSCode notebook output', async () => {
		let cellOutput: azdata.nb.IErrorResult = {
			id: 'testId',
			output_type: 'error',
			ename: 'TestException',
			evalue: 'Expected test error'
		};
		let expectedVSCodeOutput: vscode.NotebookCellOutput = {
			items: [{
				mime: 'text/html',
				data: VSBuffer.fromString('TestException: Expected test error').buffer
			}],
			id: 'testId',
			metadata: undefined
		};
		let actualOutput = convertToVSCodeCellOutput(cellOutput);
		assert.deepStrictEqual(actualOutput, expectedVSCodeOutput);
	});

	test('Deserialize VSCode notebook into ADS notebook data', async () => {
		let output = await contentManager.deserializeNotebook(''); // Argument is ignored since we're returning a mocked result
		assert.deepStrictEqual(output, expectedDeserializedNotebook);
	});

	test('Serialize ADS notebook data into VSCode notebook strings', async () => {
		await contentManager.serializeNotebook(expectedDeserializedNotebook); // Argument is ignored since we're returning a mocked result
		assert(serializeSpy.calledOnce);
		assert.deepStrictEqual(serializeSpy.firstCall.args[0], expectedSerializeArg);
	});

	const testDoc: azdata.nb.NotebookDocument = {
		uri: URI.parse('untitled:a/b/c/testNotebook.ipynb'),
		fileName: 'testFile',
		providerId: 'testProvider',
		isUntitled: true,
		isDirty: true,
		isClosed: false,
		cells: [{
			contents: {
				cell_type: 'code',
				source: '1+1',
				metadata: {
					language: 'python'
				}
			}
		}, {
			contents: {
				cell_type: 'markdown',
				source: 'abc'
			}
		}],
		kernelSpec: {
			name: 'testKernel',
			language: 'testLanguage',
			display_name: 'testKernelName'
		},
		save: () => undefined,
		setTrusted: () => undefined,
		validateCellRange: () => undefined
	};

	function validateDocsMatch(actualDoc: vscode.NotebookDocument, expectedDoc: vscode.NotebookDocument): void {
		assert.deepStrictEqual(actualDoc.uri, expectedDoc.uri);
		assert.strictEqual(actualDoc.notebookType, expectedDoc.notebookType);
		assert.strictEqual(actualDoc.version, expectedDoc.version);
		assert.strictEqual(actualDoc.isDirty, expectedDoc.isDirty);
		assert.strictEqual(actualDoc.isUntitled, expectedDoc.isUntitled);
		assert.strictEqual(actualDoc.isClosed, expectedDoc.isClosed);
		assert.deepStrictEqual(actualDoc.metadata, expectedDoc.metadata);
		assert.strictEqual(actualDoc.cellCount, expectedDoc.cellCount);
	}

	test('Convert ADS NotebookDocument into VS Code NotebookDocument', async () => {
		let expectedDoc: vscode.NotebookDocument = {
			get uri() { return testDoc.uri; },
			get notebookType() { return testDoc.providerId; },
			get version() { return undefined; },
			get isDirty() { return true; },
			get isUntitled() { return true; },
			get isClosed() { return false; },
			get metadata() { return {}; },
			get cellCount() { return 2; },
			cellAt: () => undefined,
			getCells: () => undefined,
			save: () => undefined
		};

		let actualDoc = new VSCodeNotebookDocument(testDoc);
		validateDocsMatch(actualDoc, expectedDoc);
	});

	// Have to validate cell fields manually since one of the NotebookCell fields is a function pointer,
	// which throws off the deepEqual assertions.
	function validateCellMatches(actual: vscode.NotebookCell, expected: vscode.NotebookCell): void {
		assert.strictEqual(actual.index, expected.index);
		assert.deepStrictEqual(actual.document.uri, expected.document.uri);
		assert.strictEqual(actual.document.languageId, expected.document.languageId);
		assert.deepStrictEqual(actual.notebook.uri, expected.notebook.uri);
	}
	function validateCellsMatch(actual: vscode.NotebookCell[], expected: vscode.NotebookCell[]): void {
		assert.strictEqual(actual.length, expected.length, 'Cell arrays did not have equal lengths.');
		for (let i = 0; i < actual.length; i++) {
			validateCellMatches(actual[i], expected[i]);
		}
	}

	test('Retrieve range of cells from VS Code NotebookDocument', async () => {
		let expectedCells: vscode.NotebookCell[] = testDoc.cells.map((cell, index) => convertToVSCodeNotebookCell(cell.contents.cell_type, index, cell.uri, testDoc.uri, cell.contents.metadata?.language, cell.contents.source));
		let vsDoc = new VSCodeNotebookDocument(testDoc);

		let actualCells = vsDoc.getCells();
		validateCellsMatch(actualCells, expectedCells);

		actualCells = vsDoc.getCells({ start: 0, end: 2, isEmpty: false, with: () => undefined });
		validateCellsMatch(actualCells, expectedCells);

		actualCells = vsDoc.getCells({ start: 0, end: 1, isEmpty: false, with: () => undefined });
		validateCellsMatch(actualCells, [expectedCells[0]]);

		actualCells = vsDoc.getCells({ start: 1, end: 2, isEmpty: false, with: () => undefined });
		validateCellsMatch(actualCells, [expectedCells[1]]);
	});

	test('Retrieve specific cell from VS Code NotebookDocument', async () => {
		let expectedCells: vscode.NotebookCell[] = testDoc.cells.map((cell, index) => convertToVSCodeNotebookCell(cell.contents.cell_type, index, cell.uri, testDoc.uri, cell.contents.metadata?.language, cell.contents.source));
		let vsDoc = new VSCodeNotebookDocument(testDoc);

		let firstCell = vsDoc.cellAt(0);
		validateCellMatches(firstCell, expectedCells[0]);

		firstCell = vsDoc.cellAt(-5);
		validateCellMatches(firstCell, expectedCells[0]);

		let secondCell = vsDoc.cellAt(1);
		validateCellMatches(secondCell, expectedCells[1]);

		secondCell = vsDoc.cellAt(10);
		validateCellMatches(secondCell, expectedCells[1]);
	});

	test('VS Code NotebookEditor functionality', async () => {
		let editor = <azdata.nb.NotebookEditor>{ document: testDoc };
		let vscodeEditor = new VSCodeNotebookEditor(editor);
		let expectedDoc = new VSCodeNotebookDocument(testDoc);

		validateDocsMatch(vscodeEditor.document, expectedDoc);

		// We only need the document field for VSCodeNotebookEditor, so the other
		// fields should be non-functional
		assert.throws(() => vscodeEditor.selections);
		assert.throws(() => vscodeEditor.visibleRanges);
		assert.throws(() => vscodeEditor.viewColumn);
		assert.throws(() => vscodeEditor.revealRange(undefined));
		await assert.rejects(() => vscodeEditor.edit(() => undefined));
	});
});

suite('.NET Interactive Kernel Metadata Conversion', async () => {
	test('Convert to internal kernel metadata', async () => {
		let originalMetadata: azdata.nb.INotebookMetadata = {
			kernelspec: {
				name: '.net-csharp',
				display_name: '.NET (C#)',
				language: 'C#'
			},
			language_info: {
				name: 'C#'
			}
		};
		let expectedCovertedMetadata: azdata.nb.INotebookMetadata = {
			kernelspec: {
				name: '.net-csharp',
				display_name: '.NET Interactive',
				language: 'dotnet-interactive.csharp',
				oldDisplayName: '.NET (C#)',
				oldLanguage: 'C#'
			},
			language_info: {
				name: 'dotnet-interactive.csharp',
				oldName: 'C#'
			}
		};

		convertToInternalInteractiveKernelMetadata(originalMetadata);
		assert.deepStrictEqual(originalMetadata, expectedCovertedMetadata);
	});

	test('Do not convert to internal metadata for non-Interactive kernels', async () => {
		let originalMetadata: azdata.nb.INotebookMetadata = {
			kernelspec: {
				name: 'not-interactive',
				display_name: '.NET (C#)',
				language: 'C#'
			},
			language_info: {
				name: 'C#'
			}
		};
		let expectedCovertedMetadata: azdata.nb.INotebookMetadata = {
			kernelspec: {
				name: 'not-interactive',
				display_name: '.NET (C#)',
				language: 'C#'
			},
			language_info: {
				name: 'C#'
			}
		};

		convertToInternalInteractiveKernelMetadata(originalMetadata);
		assert.deepStrictEqual(originalMetadata, expectedCovertedMetadata);
	});

	test('Add external kernel metadata', async () => {
		let originalKernelSpec: azdata.nb.IKernelSpec = {
			name: 'jupyter-notebook',
			display_name: '.NET Interactive',
			language: 'dotnet-interactive.csharp'
		};
		let expectedCovertedKernel: azdata.nb.IKernelSpec = {
			name: 'jupyter-notebook',
			display_name: '.NET Interactive',
			language: 'dotnet-interactive.csharp',
			oldName: '.net-csharp',
			oldDisplayName: '.NET (C#)',
			oldLanguage: 'C#'
		};
		addExternalInteractiveKernelMetadata(originalKernelSpec);
		assert.deepStrictEqual(originalKernelSpec, expectedCovertedKernel);
	});

	test('Do not add external metadata to non-Interactive kernels', async () => {
		// Different kernel name
		let originalKernelSpec: azdata.nb.IKernelSpec = {
			name: 'not-interactive',
			display_name: '.NET Interactive',
			language: 'dotnet-interactive.csharp'
		};
		let expectedCovertedKernel: azdata.nb.IKernelSpec = {
			name: 'not-interactive',
			display_name: '.NET Interactive',
			language: 'dotnet-interactive.csharp'
		};
		addExternalInteractiveKernelMetadata(originalKernelSpec);
		assert.deepStrictEqual(originalKernelSpec, expectedCovertedKernel);

		// Different display name
		originalKernelSpec = {
			name: 'jupyter-notebook',
			display_name: 'Not An Interactive Kernel',
			language: 'dotnet-interactive.csharp'
		};
		expectedCovertedKernel = {
			name: 'jupyter-notebook',
			display_name: 'Not An Interactive Kernel',
			language: 'dotnet-interactive.csharp'
		};
		addExternalInteractiveKernelMetadata(originalKernelSpec);
		assert.deepStrictEqual(originalKernelSpec, expectedCovertedKernel);

		// No language provided
		originalKernelSpec = {
			name: 'jupyter-notebook',
			display_name: '.NET Interactive'
		};
		expectedCovertedKernel = {
			name: 'jupyter-notebook',
			display_name: '.NET Interactive'
		};
		addExternalInteractiveKernelMetadata(originalKernelSpec);
		assert.deepStrictEqual(originalKernelSpec, expectedCovertedKernel);
	});
});
