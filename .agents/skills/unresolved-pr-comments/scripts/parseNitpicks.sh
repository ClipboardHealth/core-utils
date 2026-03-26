#!/usr/bin/env bash
# parseNitpicks.sh — Parse CodeRabbit nitpick comments from PR review bodies.
# Sourced by unresolvedPrComments.sh. Requires: jq, perl.

# Extract nitpick comments from reviews JSON (passed via stdin).
# Outputs a JSON array of nitpick comment objects.
extract_nitpick_comments() {
  local reviews_json="$1"

  perl -e '
use strict;
use warnings;
use JSON::PP;

my $reviews_json = $ARGV[0];
my $reviews = decode_json($reviews_json);

# Find latest coderabbitai review with nitpick section
my $latest_review;
my $latest_time = "";
for my $review (@$reviews) {
  my $author = $review->{author}{login} // "";
  my $body = $review->{body} // "";
  next unless $author eq "coderabbitai" && $body =~ /Nitpick comments/;
  my $created = $review->{createdAt} // "";
  if ($created gt $latest_time) {
    $latest_time = $created;
    $latest_review = $review;
  }
}

unless ($latest_review) {
  print "[]";
  exit 0;
}

my $body = $latest_review->{body};
my $author = $latest_review->{author}{login} // "deleted-user";
my $created_at = $latest_review->{createdAt} // "";

# Extract nitpick section content (handle nested blockquotes)
my $nitpick_content = extract_nitpick_section($body);
unless (defined $nitpick_content) {
  print "[]";
  exit 0;
}

# Extract file sections: <details><summary>filename (count)</summary><blockquote>...</blockquote></details>
my @comments;
while ($nitpick_content =~ /<details>\s*<summary>([^<]+?)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g) {
  my $file_name = trim($1);
  my $file_content = $2;

  # Extract individual comments: `line-range`: **title** body
  while ($file_content =~ /`(\d+(?:-\d+)?)`:\s*\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/blockquote>|$)/g) {
    my $line_range = $1;
    my $title = trim($2);
    my $clean_body = clean_comment_body(trim($3));
    push @comments, {
      author    => $author,
      body      => "$title\n\n$clean_body",
      createdAt => $created_at,
      file      => $file_name,
      line      => $line_range,
    };
  }
}

print encode_json(\@comments);

sub extract_nitpick_section {
  my ($text) = @_;
  # Match the nitpick section header
  if ($text =~ /<summary>\x{1f9f9} Nitpick comments \(\d+\)<\/summary>\s*<blockquote>/i) {
    my $content_start = $+[0];
    my $after = substr($text, $content_start);

    # Find matching closing blockquote by tracking depth
    my $depth = 1;
    my @tags;
    while ($after =~ /(<blockquote>|<\/blockquote>)/gi) {
      my $tag = $1;
      my $pos = $-[0];
      my $is_open = ($tag =~ /^<blockquote>/i) ? 1 : 0;
      push @tags, [$pos, $is_open];
    }
    for my $tag (@tags) {
      $depth += $tag->[1] ? 1 : -1;
      if ($depth == 0) {
        return substr($after, 0, $tag->[0]);
      }
    }
  }
  return undef;
}

sub clean_comment_body {
  my ($text) = @_;
  # Iteratively remove innermost <details> elements
  my $prev = "";
  while ($text ne $prev) {
    $prev = $text;
    $text =~ s/<details>(?:(?!<details>)[\s\S])*?<\/details>//g;
  }
  $text =~ s/</&lt;/g;
  $text =~ s/>/&gt;/g;
  return trim($text);
}

sub trim {
  my ($s) = @_;
  $s =~ s/^\s+//;
  $s =~ s/\s+$//;
  return $s;
}
' "$reviews_json"
}

# Extract code scanning alert number from comment body.
# Outputs the alert number or empty string.
extract_code_scanning_alert_number() {
  local body="$1"
  printf '%s' "$body" | perl -ne 'print $1 if m{/code-scanning/(\d+)}'
}
