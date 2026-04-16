import { Bell, LogOut } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useYear } from "@/contexts/YearContext";
import { useEntity } from "@/contexts/EntityContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import bonusbridgeIcon from "@/assets/bonusbridge-icon.png";

type TopNavProps = {
  notificationCount?: number;
};

export function TopNav({ notificationCount = 0 }: TopNavProps) {
  const { person, signOut } = useAuth();
  const { entity_name } = useEntity();
  const { selected_year, setSelectedYear } = useYear();

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const initials = person
    ? `${person.first_name?.[0] ?? ""}${person.last_name?.[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card px-4">
      <div className="flex items-center gap-2">
        <img src={bonusbridgeIcon} alt="BonusBridge" className="h-8 w-8 rounded-md" />
        <SidebarTrigger />
      </div>

      <div className="flex-1 flex justify-center">
        <Select
          value={String(selected_year)}
          onValueChange={(v) => setSelectedYear(Number(v))}
        >
          <SelectTrigger className="w-32 rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        {entity_name && (
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {entity_name}
          </span>
        )}

        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="Action centre">
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
            >
              {notificationCount}
            </Badge>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {person ? `${person.first_name} ${person.last_name}` : "Account"}
                </span>
                {entity_name && (
                  <span className="text-xs text-muted-foreground">{entity_name}</span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
