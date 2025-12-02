import * as vscode from 'vscode'
import { Recommendation } from '../interfaces/code-analysis-service.interface'

export class RecommendationsTreeProvider
  implements vscode.TreeDataProvider<RecommendationTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    RecommendationTreeItem | undefined | null
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private recommendations: Recommendation[] = []

  updateRecommendations(recommendations: Recommendation[]): void {
    this.recommendations = recommendations
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: RecommendationTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(): Thenable<RecommendationTreeItem[]> {
    return Promise.resolve(
      this.recommendations.map(rec => new RecommendationTreeItem(rec))
    )
  }
}

class RecommendationTreeItem extends vscode.TreeItem {
  public override readonly label: string
  public override readonly collapsibleState: vscode.TreeItemCollapsibleState

  constructor(public readonly recommendation: Recommendation) {
    super(recommendation.title, vscode.TreeItemCollapsibleState.None)
    this.label = recommendation.title
    this.collapsibleState = vscode.TreeItemCollapsibleState.None
    this.tooltip = `${recommendation.title}\n\n${recommendation.description}`
    this.description = recommendation.category
    this.iconPath = new vscode.ThemeIcon('lightbulb')
  }
}
