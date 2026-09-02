import { ExternalLink } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DBCompany } from "@/lib/financialDataService";

function stockAnalysisUrl(ticker: string, company?: DBCompany | null): string {
  if (company?.stockanalysis_url) return company.stockanalysis_url;
  return `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/`;
}

function investingComUrl(ticker: string, company?: DBCompany | null): string {
  if (company?.investing_url) return company.investing_url;
  return `https://www.investing.com/search/?q=${encodeURIComponent(ticker)}`;
}

interface CompanyLinksMenuProps {
  ticker: string;
  company?: DBCompany | null;
  children: React.ReactNode;
}

/** Dropdown of external reference links (StockAnalysis / Investing.com / IR), each opening in a new tab. */
export function CompanyLinksMenu({ ticker, company, children }: CompanyLinksMenuProps) {
  const irUrl = company?.ir_url || null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <a href={stockAnalysisUrl(ticker, company)} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
            <ExternalLink className="h-3.5 w-3.5 mr-2" />StockAnalysis
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={investingComUrl(ticker, company)} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
            <ExternalLink className="h-3.5 w-3.5 mr-2" />Investing.com
          </a>
        </DropdownMenuItem>
        {irUrl && (
          <DropdownMenuItem asChild>
            <a href={irUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
              <ExternalLink className="h-3.5 w-3.5 mr-2" />Investor Relations
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
