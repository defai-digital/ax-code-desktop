import type * as Http2 from "node:http2";
import { type AxCodeGrpcNativeBridge } from "./grpc.js";
export type AxCodeGrpcNodeHttp2ServerOptions = {
    bridge: AxCodeGrpcNativeBridge;
    host?: string;
    port?: number;
};
export type AxCodeGrpcNodeHttp2ServerHandle = {
    url: string;
    server: Http2.Http2Server;
    close(): Promise<void>;
};
export declare function bindAxCodeGrpcNodeHttp2Server(server: Http2.Http2Server, bridge: AxCodeGrpcNativeBridge): void;
export declare function startAxCodeGrpcNodeHttp2Server(options: AxCodeGrpcNodeHttp2ServerOptions): Promise<AxCodeGrpcNodeHttp2ServerHandle>;
export declare function encodeAxCodeGrpcProtoMessage(messageType: string, value: unknown): Uint8Array;
export declare function decodeAxCodeGrpcProtoMessage(messageType: string, bytes: Uint8Array): unknown;
export declare function encodeAxCodeGrpcFrame(message: Uint8Array): Uint8Array;
export declare function decodeAxCodeGrpcFrames(bytes: Uint8Array): Uint8Array[];
