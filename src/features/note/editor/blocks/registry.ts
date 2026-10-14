import type { MenuItem } from '../menu-items'
import { AiBlock } from './catalog/advanced/Ai'
import { BlockEquationBlock } from './catalog/advanced/BlockEquation'
import { BreadcrumbBlock } from './catalog/advanced/Breadcrumb'
import { ButtonBlock } from './catalog/advanced/Button'
import { FiveColumnsBlock } from './catalog/advanced/FiveColumns'
import { FourColumnsBlock } from './catalog/advanced/FourColumns'
import { InlineEquationBlock } from './catalog/advanced/InlineEquation'
import { MermaidBlock } from './catalog/advanced/Mermaid'
import { SyncedBlock } from './catalog/advanced/Synced'
import { TableOfContentsBlock } from './catalog/advanced/TableOfContents'
import { TabsBlock } from './catalog/advanced/Tabs'
import { ThreeColumnsBlock } from './catalog/advanced/ThreeColumns'
import { ToggleHeading1Block } from './catalog/advanced/ToggleHeading1'
import { ToggleHeading2Block } from './catalog/advanced/ToggleHeading2'
import { ToggleHeading3Block } from './catalog/advanced/ToggleHeading3'
import { TwoColumnsBlock } from './catalog/advanced/TwoColumns'
import { PageBlock } from './catalog/content/Page'
import { TableBlock } from './catalog/content/Table'
import { BoardViewBlock } from './catalog/database/BoardView'
import { CalendarViewBlock } from './catalog/database/CalendarView'
import { DashboardViewBlock } from './catalog/database/DashboardView'
import { DatabaseFullPageBlock } from './catalog/database/DatabaseFullPage'
import { DatabaseInlineBlock } from './catalog/database/DatabaseInline'
import { DonutChartBlock } from './catalog/database/DonutChart'
import { FeedViewBlock } from './catalog/database/FeedView'
import { FormBlock } from './catalog/database/Form'
import { GalleryViewBlock } from './catalog/database/GalleryView'
import { HorizontalBarChartBlock } from './catalog/database/HorizontalBarChart'
import { LineChartBlock } from './catalog/database/LineChart'
import { LinkedViewOfDataSourceBlock } from './catalog/database/LinkedViewOfDataSource'
import { ListViewBlock } from './catalog/database/ListView'
import { MapViewBlock } from './catalog/database/MapView'
import { NumberChartBlock } from './catalog/database/NumberChart'
import { TableViewBlock } from './catalog/database/TableView'
import { TimelineViewBlock } from './catalog/database/TimelineView'
import { VerticalBarChartBlock } from './catalog/database/VerticalBarChart'
import { DateOrReminderBlock } from './catalog/inline/DateOrReminder'
import { EmojiBlock } from './catalog/inline/Emoji'
import { MentionAPageOrDataSourceBlock } from './catalog/inline/MentionAPageOrDataSource'
import { MentionAPersonBlock } from './catalog/inline/MentionAPerson'
import { AudioBlock } from './catalog/media/Audio'
import { EmbedBlock } from './catalog/media/Embed'
import { FileBlock } from './catalog/media/File'
import { GithubGistBlock } from './catalog/media/GithubGist'
import { GoogleDriveBlock } from './catalog/media/GoogleDrive'
import { HtmlBlock } from './catalog/media/Html'
import { ImageBlock } from './catalog/media/Image'
import { TweetBlock } from './catalog/media/Tweet'
import { VideoBlock } from './catalog/media/Video'
import { WebBookmarkBlock } from './catalog/media/WebBookmark'
import { BulletedListBlock } from './catalog/text/BulletedList'
import { CalloutBlock } from './catalog/text/Callout'
import { CodeBlock } from './catalog/text/Code'
import { DividerBlock } from './catalog/text/Divider'
import { Heading1Block } from './catalog/text/Heading1'
import { Heading2Block } from './catalog/text/Heading2'
import { Heading3Block } from './catalog/text/Heading3'
import { Heading4Block } from './catalog/text/Heading4'
import { LinkToPageBlock } from './catalog/text/LinkToPage'
import { NumberedListBlock } from './catalog/text/NumberedList'
import { QuoteBlock } from './catalog/text/Quote'
import { TextBlock } from './catalog/text/Text'
import { ToDoListBlock } from './catalog/text/ToDoList'
import { ToggleListBlock } from './catalog/text/ToggleList'

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
