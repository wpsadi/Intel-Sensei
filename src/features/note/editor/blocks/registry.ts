import { TextBlock } from './catalog/text/Text'
import { Heading1Block } from './catalog/text/Heading1'
import { Heading2Block } from './catalog/text/Heading2'
import { Heading3Block } from './catalog/text/Heading3'
import { Heading4Block } from './catalog/text/Heading4'
import { BulletedListBlock } from './catalog/text/BulletedList'
import { NumberedListBlock } from './catalog/text/NumberedList'
import { ToDoListBlock } from './catalog/text/ToDoList'
import { ToggleListBlock } from './catalog/text/ToggleList'
import { DividerBlock } from './catalog/text/Divider'
import { LinkToPageBlock } from './catalog/text/LinkToPage'
import { PageBlock } from './catalog/content/Page'
import { CalloutBlock } from './catalog/text/Callout'
import { QuoteBlock } from './catalog/text/Quote'
import { TableBlock } from './catalog/content/Table'
import { CodeBlock } from './catalog/text/Code'
import { ImageBlock } from './catalog/media/Image'
import { VideoBlock } from './catalog/media/Video'
import { AudioBlock } from './catalog/media/Audio'
import { FileBlock } from './catalog/media/File'
import { WebBookmarkBlock } from './catalog/media/WebBookmark'
import { EmbedBlock } from './catalog/media/Embed'
import { HtmlBlock } from './catalog/media/Html'
import { GoogleDriveBlock } from './catalog/media/GoogleDrive'
import { TweetBlock } from './catalog/media/Tweet'
import { GithubGistBlock } from './catalog/media/GithubGist'
import { TableViewBlock } from './catalog/database/TableView'
import { BoardViewBlock } from './catalog/database/BoardView'
import { GalleryViewBlock } from './catalog/database/GalleryView'
import { ListViewBlock } from './catalog/database/ListView'
import { FeedViewBlock } from './catalog/database/FeedView'
import { DashboardViewBlock } from './catalog/database/DashboardView'
import { CalendarViewBlock } from './catalog/database/CalendarView'
import { TimelineViewBlock } from './catalog/database/TimelineView'
import { MapViewBlock } from './catalog/database/MapView'
import { VerticalBarChartBlock } from './catalog/database/VerticalBarChart'
import { HorizontalBarChartBlock } from './catalog/database/HorizontalBarChart'
import { LineChartBlock } from './catalog/database/LineChart'
import { DonutChartBlock } from './catalog/database/DonutChart'
import { NumberChartBlock } from './catalog/database/NumberChart'
import { FormBlock } from './catalog/database/Form'
import { DatabaseInlineBlock } from './catalog/database/DatabaseInline'
import { DatabaseFullPageBlock } from './catalog/database/DatabaseFullPage'
import { LinkedViewOfDataSourceBlock } from './catalog/database/LinkedViewOfDataSource'
import { TableOfContentsBlock } from './catalog/advanced/TableOfContents'
import { BlockEquationBlock } from './catalog/advanced/BlockEquation'
import { InlineEquationBlock } from './catalog/advanced/InlineEquation'
import { ButtonBlock } from './catalog/advanced/Button'
import { BreadcrumbBlock } from './catalog/advanced/Breadcrumb'
import { TabsBlock } from './catalog/advanced/Tabs'
import { SyncedBlock } from './catalog/advanced/Synced'
import { ToggleHeading1Block } from './catalog/advanced/ToggleHeading1'
import { ToggleHeading2Block } from './catalog/advanced/ToggleHeading2'
import { ToggleHeading3Block } from './catalog/advanced/ToggleHeading3'
import { TwoColumnsBlock } from './catalog/advanced/TwoColumns'
import { ThreeColumnsBlock } from './catalog/advanced/ThreeColumns'
import { FourColumnsBlock } from './catalog/advanced/FourColumns'
import { FiveColumnsBlock } from './catalog/advanced/FiveColumns'
import { MermaidBlock } from './catalog/advanced/Mermaid'
import { AiBlock } from './catalog/advanced/Ai'
import { MentionAPersonBlock } from './catalog/inline/MentionAPerson'
import { MentionAPageOrDataSourceBlock } from './catalog/inline/MentionAPageOrDataSource'
import { DateOrReminderBlock } from './catalog/inline/DateOrReminder'
import { EmojiBlock } from './catalog/inline/Emoji'
import type { MenuItem } from '../suggestion-menu'

/** Every insertable block, in menu order. Each block lives in its own file under catalog/. */
export const BLOCKS: MenuItem[] = [
  TextBlock,
  Heading1Block,
  Heading2Block,
  Heading3Block,
  Heading4Block,
  BulletedListBlock,
  NumberedListBlock,
  ToDoListBlock,
  ToggleListBlock,
  DividerBlock,
  LinkToPageBlock,
  CalloutBlock,
  QuoteBlock,
  CodeBlock,
  PageBlock,
  TableBlock,
  ImageBlock,
  VideoBlock,
  AudioBlock,
  FileBlock,
  WebBookmarkBlock,
  EmbedBlock,
  HtmlBlock,
  GoogleDriveBlock,
  TweetBlock,
  GithubGistBlock,
  TableViewBlock,
  BoardViewBlock,
  GalleryViewBlock,
  ListViewBlock,
  FeedViewBlock,
  DashboardViewBlock,
  CalendarViewBlock,
  TimelineViewBlock,
  MapViewBlock,
  VerticalBarChartBlock,
  HorizontalBarChartBlock,
  LineChartBlock,
  DonutChartBlock,
  NumberChartBlock,
  FormBlock,
  DatabaseInlineBlock,
  DatabaseFullPageBlock,
  LinkedViewOfDataSourceBlock,
  TableOfContentsBlock,
  BlockEquationBlock,
  InlineEquationBlock,
  ButtonBlock,
  BreadcrumbBlock,
  TabsBlock,
  SyncedBlock,
  ToggleHeading1Block,
  ToggleHeading2Block,
  ToggleHeading3Block,
  TwoColumnsBlock,
  ThreeColumnsBlock,
  FourColumnsBlock,
  FiveColumnsBlock,
  MermaidBlock,
  AiBlock,
  MentionAPersonBlock,
  MentionAPageOrDataSourceBlock,
  DateOrReminderBlock,
  EmojiBlock,
]
