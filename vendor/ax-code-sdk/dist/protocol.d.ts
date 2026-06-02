export declare const AX_CODE_DIRECTORY_HEADER = "x-ax-code-directory";
export declare const AX_CODE_WORKSPACE_HEADER = "x-ax-code-workspace";
export declare const LEGACY_OPENCODE_DIRECTORY_HEADER = "x-opencode-directory";
export declare const LEGACY_OPENCODE_WORKSPACE_HEADER = "x-opencode-workspace";
export declare function withDirectoryHeaders(headers: Record<string, string> | undefined, directory: string): {
    "x-ax-code-directory": string;
    "x-opencode-directory": string;
};
export declare function withWorkspaceHeaders(headers: Record<string, string> | undefined, workspaceID: string): {
    "x-ax-code-workspace": string;
    "x-opencode-workspace": string;
};
