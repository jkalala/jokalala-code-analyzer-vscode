/**
 * Jokalala GitHub Integration Plugin
 *
 * Main entry point for the GitHub integration plugin.
 * Provides functionality to:
 * - Auto-create GitHub issues from security findings
 * - Link findings to pull requests
 * - Track remediation progress
 */
import { PluginContext } from './types';
/**
 * Plugin activation
 */
export declare function activate(context: PluginContext): Promise<void>;
/**
 * Plugin deactivation
 */
export declare function deactivate(): Promise<void>;
declare const _default: {
    activate: typeof activate;
    deactivate: typeof deactivate;
};
export default _default;
//# sourceMappingURL=index.d.ts.map