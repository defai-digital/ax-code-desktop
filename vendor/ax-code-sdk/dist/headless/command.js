export function commandAcceptsAsyncMode(command) {
    return command.type === "session.prompt" || command.type === "session.command" || command.type === "session.shell";
}
