/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * See 'LICENSE' in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { Position, ResponseError } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { DefaultClient, GetCopilotHoverInfoParams, GetCopilotHoverInfoRequest } from '../client';
import { RequestCancelled, ServerCancelled } from '../protocolFilter';
import { CppSettings } from '../settings';

nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize: nls.LocalizeFunc = nls.loadMessageBundle();

export class CopilotHoverProvider implements vscode.HoverProvider {
    private client: DefaultClient;
    private currentDocument: vscode.TextDocument | undefined;
    private currentPosition: vscode.Position | undefined;
    private waiting: boolean = false;
    private ready: boolean = false;
    private cancelled: boolean = false;
    private cancelledDocument: vscode.TextDocument | undefined;
    private cancelledPosition: vscode.Position | undefined;
    private content: string | undefined;
    constructor(client: DefaultClient) {
        this.client = client;
    }

    public async provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
        await this.client.ready;
        const settings: CppSettings = new CppSettings(vscode.workspace.getWorkspaceFolder(document.uri)?.uri);
        if (settings.hover === "disabled") {
            return undefined;
        }

        if (!this.isNewHover(document, position)) {
            if (this.ready) {
                const contentMarkdown = new vscode.MarkdownString(this.content);
                return new vscode.Hover(contentMarkdown);
            }
            if (this.waiting) {
                const loadingMarkdown = new vscode.MarkdownString("$(loading~spin)", true);
                return new vscode.Hover(loadingMarkdown);
            }
        }

        // Fresh hover, reset state.
        this.reset();
        this.currentDocument = document;
        this.currentPosition = position;
        const commandString = "$(sparkle) [" + localize("generate.copilot.description", "Generate Copilot Description") + "](command:C_Cpp.ShowCopilotHover)";
        const commandMarkdown = new vscode.MarkdownString(commandString);
        commandMarkdown.supportThemeIcons = true;
        commandMarkdown.isTrusted = true;
        return new vscode.Hover(commandMarkdown);
    }

    public showWaiting(): void {
        this.waiting = true;
    }

    public showContent(content: string): void {
        this.ready = true;
        this.content = content;
    }

    public getCurrentHoverDocument(): vscode.TextDocument | undefined {
        return this.currentDocument;
    }

    public getCurrentHoverPosition(): vscode.Position | undefined {
        return this.currentPosition;
    }

    public async getRequestInfo(document: vscode.TextDocument, position: vscode.Position): Promise<string> {
        let requestInfo = "";
        const params: GetCopilotHoverInfoParams = {
            uri: document.uri.toString(),
            position: Position.create(position.line, position.character)
        };
        await this.client.ready;
        try {
            const response = await this.client.languageClient.sendRequest(GetCopilotHoverInfoRequest, params);
            requestInfo = response.content;
        } catch (e: any) {
            if (e instanceof ResponseError && (e.code === RequestCancelled || e.code === ServerCancelled)) {
                throw new vscode.CancellationError();
            }
            throw e;
        }

        return requestInfo;
    }

    public isCancelled(document: vscode.TextDocument, position: vscode.Position): boolean {
        if (this.cancelled && this.cancelledDocument === document && this.cancelledPosition === position) {
            // Cancellation is being acknowledged.
            this.cancelled = false;
            this.cancelledDocument = undefined;
            this.cancelledPosition = undefined;
            return true;
        }
        return false;
    }

    private reset(): void {
        // If there was a previous call, cancel it.
        if (this.waiting) {
            this.cancelled = true;
            this.cancelledDocument = this.currentDocument;
            this.cancelledPosition = this.currentPosition;
        }
        this.waiting = false;
        this.ready = false;
        this.content = undefined;
    }

    private isNewHover(document: vscode.TextDocument, position: vscode.Position): boolean {
        return !(this.currentDocument === document && this.currentPosition?.line === position.line && (this.currentPosition?.character === position.character || this.currentPosition?.character === position.character - 1));
    }
}