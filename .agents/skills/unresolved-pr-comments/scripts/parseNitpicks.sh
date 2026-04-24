#!/usr/bin/env bash
# parseNitpicks.sh — Parse CodeRabbit review-body comments from PR review bodies.
# Sourced by unresolvedPrComments.sh. Requires: jq, perl.

# Extract CodeRabbit review-body comments from reviews JSON (passed via stdin).
# Outputs a JSON array of comment objects. The function name is retained for
# backward compatibility with existing skill scripts.
extract_nitpick_comments() {
  local reviews_json="$1"

  printf '%s' "$reviews_json" | perl -e '
use strict;
use warnings;
use JSON::PP;

local $/;
my $reviews_json = <STDIN>;
my $reviews = decode_json($reviews_json);

# Find latest coderabbitai review with supported review-body comment sections.
my $latest_review;
my $latest_time = "";
for my $review (@$reviews) {
  my $author = $review->{author}{login} // "";
  my $body = $review->{body} // "";
  next unless $author eq "coderabbitai" && has_supported_sections($body);
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

my @sections = extract_review_body_comment_sections($body);
unless (@sections) {
  print "[]";
  exit 0;
}

my @comments;
for my $section (@sections) {
  my $section_content = $section->{content};
  my $category = $section->{category};

  # Extract file sections: <details><summary>filename (count)</summary><blockquote>...</blockquote></details>
  while ($section_content =~ /<details>\s*<summary>([^<]+?)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g) {
    my $raw_file_name = trim($1);
    my $file_content = $2;

    # Extract individual comments: `line-range`: severity metadata, **title**, body
    while ($file_content =~ /`(\d+(?:-\d+)?)`:\s*(?:_[^_]+_\s*\|\s*_[^_]+_\s*)?\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/blockquote>|$)/g) {
      my $line_range = $1;
      my $title = trim($2);
      my $clean_body = clean_comment_body(trim($3));
      my $file_name = normalize_file_name($raw_file_name, $line_range);
      push @comments, {
        author    => $author,
        body      => "$title\n\n$clean_body",
        category  => $category,
        createdAt => $created_at,
        file      => $file_name,
        line      => $line_range,
      };
    }
  }
}

print encode_json(\@comments);

sub has_supported_sections {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);
  return $text =~ /<summary>\s*[^<]*(?:Nitpick comments|Minor comments|Outside diff range comments)\s*\(\d+\)<\/summary>\s*<blockquote>/i;
}

sub extract_review_body_comment_sections {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);

  my @sections;
  while ($text =~ /<summary>\s*[^<]*(Nitpick comments|Minor comments|Outside diff range comments)\s*\(\d+\)<\/summary>\s*<blockquote>/ig) {
    my $category = section_category($1);
    my $content_start = $+[0];
    my $after = substr($text, $content_start);

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
        push @sections, {
          category => $category,
          content  => substr($after, 0, $tag->[0]),
        };
        last;
      }
    }
  }
  return @sections;
}

sub section_category {
  my ($label) = @_;
  return "nitpick" if $label =~ /Nitpick comments/i;
  return "minor" if $label =~ /Minor comments/i;
  return "outside-diff" if $label =~ /Outside diff range comments/i;
  return "unknown";
}

sub normalize_file_name {
  my ($file_name, $line_range) = @_;
  my $suffix = "-" . $line_range;
  $file_name =~ s/\Q$suffix\E$//;
  return $file_name;
}

sub strip_markdown_blockquote_prefixes {
  my ($text) = @_;
  $text =~ s/^[ \t]*>[ \t]?//mg;
  return $text;
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
'
}

# Extract code scanning alert number from comment body.
# Outputs the alert number or empty string.
extract_code_scanning_alert_number() {
  local body="$1"
  printf '%s' "$body" | perl -ne 'print $1 if m{/code-scanning/(\d+)}'
}
