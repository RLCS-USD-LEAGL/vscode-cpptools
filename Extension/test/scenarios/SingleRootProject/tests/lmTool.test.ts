/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * See 'LICENSE' in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ok } from 'assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as util from '../../../../src/common';
import { ChatContextResult, DefaultClient, ProjectContextResult } from '../../../../src/LanguageServer/client';
import { ClientCollection } from '../../../../src/LanguageServer/clientCollection';
import * as extension from '../../../../src/LanguageServer/extension';
import { CppConfigurationLanguageModelTool, getProjectContext } from '../../../../src/LanguageServer/lmTool';
import * as telemetry from '../../../../src/telemetry';

describe('CppConfigurationLanguageModelTool Tests', () => {
    let mockLanguageModelToolInvocationOptions: sinon.SinonStubbedInstance<vscode.LanguageModelToolInvocationOptions<void>>;
    let activeClientStub: sinon.SinonStubbedInstance<DefaultClient>;
    let mockTextEditorStub: MockTextEditor;
    let mockTextDocumentStub: sinon.SinonStubbedInstance<vscode.TextDocument>;
    let languageModelToolTelemetryStub: sinon.SinonStub;

    class MockLanguageModelToolInvocationOptions implements vscode.LanguageModelToolInvocationOptions<void> {
        tokenizationOptions?: vscode.LanguageModelToolTokenizationOptions | undefined;
        toolInvocationToken: undefined;
        input: undefined;
    }
    class MockTextEditor implements vscode.TextEditor {
        constructor(selection: vscode.Selection, selections: readonly vscode.Selection[], visibleRanges: readonly vscode.Range[], options: vscode.TextEditorOptions, document: vscode.TextDocument, viewColumn?: vscode.ViewColumn) {
            this.selection = selection;
            this.selections = selections;
            this.visibleRanges = visibleRanges;
            this.options = options;
            this.viewColumn = viewColumn;
            this.document = document;
        }
        selection: vscode.Selection;
        selections: readonly vscode.Selection[];
        visibleRanges: readonly vscode.Range[];
        options: vscode.TextEditorOptions;
        viewColumn: vscode.ViewColumn | undefined;
        edit(_callback: (editBuilder: vscode.TextEditorEdit) => void, _options?: { readonly undoStopBefore: boolean; readonly undoStopAfter: boolean }): Thenable<boolean> {
            throw new Error('Method not implemented.');
        }
        insertSnippet(_snippet: vscode.SnippetString, _location?: vscode.Position | vscode.Range | readonly vscode.Position[] | readonly vscode.Range[], _options?: { readonly undoStopBefore: boolean; readonly undoStopAfter: boolean }): Thenable<boolean> {
            throw new Error('Method not implemented.');
        }
        setDecorations(_decorationType: vscode.TextEditorDecorationType, _rangesOrOptions: readonly vscode.Range[] | readonly vscode.DecorationOptions[]): void {
            throw new Error('Method not implemented.');
        }
        revealRange(_range: vscode.Range, _revealType?: vscode.TextEditorRevealType): void {
            throw new Error('Method not implemented.');
        }
        show(_column?: vscode.ViewColumn): void {
            throw new Error('Method not implemented.');
        }
        hide(): void {
            throw new Error('Method not implemented.');
        }
        document: vscode.TextDocument;
    }
    class MockTextDocument implements vscode.TextDocument {
        uri: vscode.Uri;
        constructor(uri: vscode.Uri, fileName: string, isUntitled: boolean, languageId: string, version: number, isDirty: boolean, isClosed: boolean, eol: vscode.EndOfLine, lineCount: number) {
            this.uri = uri;
            this.fileName = fileName;
            this.isUntitled = isUntitled;
            this.languageId = languageId;
            this.version = version;
            this.isDirty = isDirty;
            this.isClosed = isClosed;
            this.eol = eol;
            this.lineCount = lineCount;
        }
        fileName: string;
        isUntitled: boolean;
        languageId: string;
        version: number;
        isDirty: boolean;
        isClosed: boolean;
        save(): Thenable<boolean> {
            throw new Error('Method not implemented.');
        }
        eol: vscode.EndOfLine;
        lineCount: number;

        lineAt(line: number): vscode.TextLine;
        // eslint-disable-next-line @typescript-eslint/unified-signatures
        lineAt(position: vscode.Position): vscode.TextLine;
        lineAt(_arg: number | vscode.Position): vscode.TextLine {
            throw new Error('Method not implemented.');
        }
        offsetAt(_position: vscode.Position): number {
            throw new Error('Method not implemented.');
        }
        positionAt(_offset: number): vscode.Position {
            throw new Error('Method not implemented.');
        }
        getText(_range?: vscode.Range): string {
            throw new Error('Method not implemented.');
        }
        getWordRangeAtPosition(_position: vscode.Position, _regex?: RegExp): vscode.Range | undefined {
            throw new Error('Method not implemented.');
        }
        validateRange(_range: vscode.Range): vscode.Range {
            throw new Error('Method not implemented.');
        }
        validatePosition(_position: vscode.Position): vscode.Position {
            throw new Error('Method not implemented.');
        }
    }
    beforeEach(() => {
        sinon.stub(util, 'extensionContext').value({ extension: { id: 'test-extension-id' } });

        mockTextDocumentStub = sinon.createStubInstance(MockTextDocument);
        mockTextEditorStub = new MockTextEditor(new vscode.Selection(0, 0, 0, 0), [], [], { tabSize: 4 }, mockTextDocumentStub);
        mockLanguageModelToolInvocationOptions = new MockLanguageModelToolInvocationOptions();
        activeClientStub = sinon.createStubInstance(DefaultClient);
        const clientsStub = sinon.createStubInstance(ClientCollection);
        sinon.stub(extension, 'getClients').returns(clientsStub);
        sinon.stub(clientsStub, 'ActiveClient').get(() => activeClientStub);
        activeClientStub.getIncludes.resolves({ includedFiles: [] });
        sinon.stub(vscode.window, 'activeTextEditor').get(() => mockTextEditorStub);
        languageModelToolTelemetryStub = sinon.stub(telemetry, 'logLanguageModelEvent').returns();
    });

    afterEach(() => {
        sinon.restore();
    });

    const arrangeChatContextFromCppTools = ({ chatContextFromCppTools, isCpp, isHeaderFile }:
    { chatContextFromCppTools?: ChatContextResult; isCpp?: boolean; isHeaderFile?: boolean } =
    { chatContextFromCppTools: undefined, isCpp: undefined, isHeaderFile: false }
    ) => {
        activeClientStub.getChatContext.resolves(chatContextFromCppTools);
        sinon.stub(util, 'isCpp').returns(isCpp ?? true);
        sinon.stub(util, 'isHeaderFile').returns(isHeaderFile ?? false);
    };

    const arrangeProjectContextFromCppTools = ({ projectContextFromCppTools, isCpp, isHeaderFile }:
    { projectContextFromCppTools?: ProjectContextResult; isCpp?: boolean; isHeaderFile?: boolean } =
    { projectContextFromCppTools: undefined, isCpp: undefined, isHeaderFile: false }
    ) => {
        activeClientStub.getProjectContext.resolves(projectContextFromCppTools);
        sinon.stub(util, 'isCpp').returns(isCpp ?? true);
        sinon.stub(util, 'isHeaderFile').returns(isHeaderFile ?? false);
    };

    it('should log telemetry and provide #cpp chat context.', async () => {
        arrangeChatContextFromCppTools({
            chatContextFromCppTools: {
                language: 'cpp',
                standardVersion: 'c++20',
                compiler: 'msvc',
                targetPlatform: 'windows',
                targetArchitecture: 'x64'
            }
        });

        const result = await new CppConfigurationLanguageModelTool().invoke(mockLanguageModelToolInvocationOptions, new vscode.CancellationTokenSource().token);

        ok(languageModelToolTelemetryStub.calledOnce, 'logLanguageModelToolEvent should be called once');
        ok(languageModelToolTelemetryStub.calledWithMatch('Chat/Tool/cpp', sinon.match({
            "language": 'C++',
            "compiler": 'MSVC',
            "standardVersion": 'C++20',
            "targetPlatform": 'Windows',
            "targetArchitecture": 'x64'
        })));
        ok(result, 'result should not be undefined');
        const text = result.content[0] as vscode.LanguageModelTextPart;
        ok(text, 'result should contain a text part');
        ok(text.value === 'The user is working on a C++ project. The project uses language version C++20. The project compiles using the MSVC compiler. The project targets the Windows platform. The project targets the x64 architecture. ');
    });

    const testGetProjectContext = async ({
        compiler,
        expectedCompiler,
        context,
        compilerArguments: compilerArguments,
        expectedCompilerArguments
    }: {
        compiler: string;
        expectedCompiler: string;
        context: { flags: Record<string, unknown> };
        compilerArguments: string[];
        expectedCompilerArguments: string[];
    }) => {
        arrangeProjectContextFromCppTools({
            projectContextFromCppTools: {
                language: 'cpp',
                standardVersion: 'c++20',
                compiler: compiler,
                targetPlatform: 'windows',
                targetArchitecture: 'x64',
                fileContext: {
                    compilerArguments: compilerArguments
                }
            }
        });

        const result = await getProjectContext(context, new vscode.CancellationTokenSource().token);

        ok(languageModelToolTelemetryStub.calledOnce, 'logLanguageModelToolEvent should be called once');
        ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
            "language": 'C++'
        })));
        if (expectedCompiler) {
            ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
                "compiler": expectedCompiler
            })));
        }
        ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
            "standardVersion": 'C++20'
        })));
        ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
            "targetPlatform": 'Windows'
        })));
        ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
            "targetArchitecture": 'x64'
        })));
        ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
            "compilerArgumentCount": compilerArguments.length.toString()
        })));
        if (expectedCompilerArguments.length > 0) {
            ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
                "filteredCompilerArguments": expectedCompilerArguments.join(', ')
            })));
        }
        ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
            'time': sinon.match.string
        })));
        ok(result, 'result should not be undefined');
        ok(result.language === 'C++');
        ok(result.compiler === expectedCompiler);
        ok(result.standardVersion === 'C++20');
        ok(result.targetPlatform === 'Windows');
        ok(result.targetArchitecture === 'x64');
        ok(JSON.stringify(result.compilerArguments) === JSON.stringify(expectedCompilerArguments));
    };

    it('should log telemetry and provide cpp context properly when experimental flags are not defined.', async () => {
        await testGetProjectContext({
            compiler: 'gcc',
            expectedCompiler: 'GCC',
            context: { flags: {} },
            compilerArguments: ['-Wall', '-Werror', '-std=c++20'],
            expectedCompilerArguments: []
        });
    });

    it('should provide compilerArguments based on copilotcppGccCompilerArgumentFilter.', async () => {
        await testGetProjectContext({
            compiler: 'gcc',
            expectedCompiler: 'GCC',
            context: { flags: { copilotcppGccCompilerArgumentFilter: '^-(fno\-exceptions|fno\-rtti)$' } },
            compilerArguments: ['-Wall', '-Werror', '-std=c++20', '-fno-exceptions', '-fno-rtti', '-pthread', '-O3', '-funroll-loops'],
            expectedCompilerArguments: ['-fno-exceptions', '-fno-rtti']
        });
    });

    it('should filter out all compilerArguments for unkonwn compilers.', async () => {
        await testGetProjectContext({
            compiler: 'unknown',
            expectedCompiler: '',
            context: {
                flags: {
                    copilotcppMsvcCompilerArgumentFilter: '^-(fno\-exceptions|fno\-rtti)$',
                    copilotcppClangCompilerArgumentFilter: '^-(fno\-exceptions|fno\-rtti)$',
                    copilotcppGccCompilerArgumentFilter: '^-(fno\-exceptions|fno\-rtti)$'
                }
            },
            compilerArguments: ['-fno-exceptions', '-fno-rtti'],
            expectedCompilerArguments: []
        });
    });

    it('should not log telemetry for unknown values', async () => {
        arrangeProjectContextFromCppTools({
            projectContextFromCppTools: {
                language: 'java',
                standardVersion: 'gnu++17',
                compiler: 'javac',
                targetPlatform: 'arduino',
                targetArchitecture: 'bar',
                fileContext: {
                    compilerArguments: []
                }
            }
        });

        const result = await getProjectContext({ flags: {} }, new vscode.CancellationTokenSource().token);

        ok(languageModelToolTelemetryStub.calledOnce, 'logLanguageModelToolEvent should be called once');
        ok(languageModelToolTelemetryStub.calledWithMatch('Completions/tool', sinon.match({
            "compilerArgumentCount": '0',
            "targetArchitecture": 'bar'
        })));
        ok(result, 'result should not be undefined');
        ok(result.language === '');
        ok(result.compiler === '');
        ok(result.standardVersion === '');
        ok(result.targetPlatform === '');
        ok(result.targetArchitecture === 'bar');
        ok(result.compilerArguments.length === 0);
    });
});
